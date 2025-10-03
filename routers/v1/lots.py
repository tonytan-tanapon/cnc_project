# routers/lots.py
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy.exc import IntegrityError
from sqlalchemy import or_, func
from typing import List, Optional

from database import get_db
from models import ProductionLot, Part, PartRevision, PO
from schemas import ProductionLotCreate, ProductionLotUpdate, ProductionLotOut
from utils.code_generator import next_code_yearly

router = APIRouter(prefix="/lots", tags=["lots"])

# ---------- paging schema ----------
from pydantic import BaseModel

class LotPage(BaseModel):
    items: List[ProductionLotOut]
    total: int
    page: int
    per_page: int
    pages: int

def _like_escape(term: str) -> str:
    esc = term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{esc}%"

def _with_joined(db: Session, lot_id: int):
    return (db.query(ProductionLot)
             .options(
                 joinedload(ProductionLot.part),
                 joinedload(ProductionLot.po),
                 joinedload(ProductionLot.part_revision),  # <- NEW
             )
             .filter(ProductionLot.id == lot_id)
             .first())

@router.post("", response_model=ProductionLotOut)
def create_lot(payload: ProductionLotCreate, db: Session = Depends(get_db)):
    if payload.po_id is not None and not db.get(PO, payload.po_id):
        raise HTTPException(404, "PO not found")

    part = db.get(Part, payload.part_id)
    if not part:
        raise HTTPException(404, "Part not found")

    # ✅ Revision optional: if provided, validate it belongs to the part;
    #    if not provided, try auto-pick current; else keep None.
    rev_id = payload.part_revision_id
    if rev_id is not None:
        prv = db.get(PartRevision, rev_id)
        if not prv or prv.part_id != part.id:
            raise HTTPException(400, "part_revision_id does not belong to part_id")
    else:
        prv = db.query(PartRevision).filter(
            PartRevision.part_id == part.id,
            PartRevision.is_current == True
        ).first()
        rev_id = prv.id if prv else None

    raw = (payload.lot_no or "").strip().upper()
    autogen = raw in ("", "AUTO", "AUTOGEN")
    lot_no = next_code_yearly(db, ProductionLot, "lot_no", prefix="LOT") if autogen else raw

    if db.query(ProductionLot).filter(ProductionLot.lot_no == lot_no).first():
        raise HTTPException(409, "Lot number already exists")

    lot = ProductionLot(
        lot_no=lot_no,
        part_id=payload.part_id,
        part_revision_id=rev_id,          # ✅ may be None
        po_id=payload.po_id,
        planned_qty=payload.planned_qty or 0,
        started_at=payload.started_at,
        finished_at=payload.finished_at,
        status=payload.status or "in_process",
    )

    for _ in range(3):
        try:
            db.add(lot); db.commit(); db.refresh(lot)
            return _with_joined(db, lot.id)
        except IntegrityError:
            db.rollback()
            if autogen:
                lot.lot_no = next_code_yearly(db, ProductionLot, "lot_no", prefix="LOT")
            else:
                raise HTTPException(409, "Lot number already exists")

    raise HTTPException(500, "Failed to generate unique lot number")

@router.get("", response_model=LotPage)
def list_lots(
    q: Optional[str] = Query(None, description="Search lot/part/po/status"),
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=100),
    db: Session = Depends(get_db),
):
    qry = (
        db.query(ProductionLot)
        .join(Part, Part.id == ProductionLot.part_id)
        .outerjoin(PO, PO.id == ProductionLot.po_id)
        .options(
            joinedload(ProductionLot.part),
            joinedload(ProductionLot.po),
            joinedload(ProductionLot.part_revision),
        )
    )

    if q and q.strip():
        for tok in q.strip().split():
            pat = _like_escape(tok)
            qry = qry.filter(or_(
                ProductionLot.lot_no.ilike(pat),
                ProductionLot.status.ilike(pat),
                Part.part_no.ilike(pat),
                Part.name.ilike(pat),
                PO.po_number.ilike(pat),
                PO.description.ilike(pat),
                func.concat("[", func.coalesce(Part.part_no, ""), "] ", func.coalesce(Part.name, "")).ilike(pat),
            ))

    total = qry.count()
    items = (qry.order_by(ProductionLot.id.desc())
                .offset((page - 1) * per_page)
                .limit(per_page)
                .all())
    pages = (total + per_page - 1) // per_page if per_page else 1

    return {
        "items": items,
        "total": total,
        "page": page,
        "per_page": per_page,
        "pages": max(pages, 1),
    }
class LotCursorPage(BaseModel):
    items: List[ProductionLotOut]
    next_cursor: int | None = None
    prev_cursor: int | None = None
    has_more: bool

# --- place below your existing list_lots or anywhere before /{lot_id} ---
class LotCursorPage(BaseModel):
    items: List[ProductionLotOut]
    next_cursor: int | None = None
    prev_cursor: int | None = None
    has_more: bool

from sqlalchemy.orm import Session, joinedload, selectinload, load_only
from sqlalchemy import or_, func
@router.get("/keyset", response_model=LotCursorPage)
def list_lots_keyset(
    q: Optional[str] = Query(None, description="Search lot/part/po/status"),
    limit: int = Query(25, ge=1, le=200),
    cursor: Optional[int] = Query(None, description="fetch id < cursor (DESC)"),
    db: Session = Depends(get_db),
):
    # leaner payload + batched relation loads
    base = (
        db.query(ProductionLot)
        .options(
            load_only(
                ProductionLot.id,
                ProductionLot.lot_no,
                ProductionLot.part_id,
                ProductionLot.po_id,
                ProductionLot.planned_qty,
                ProductionLot.status,
                ProductionLot.started_at,
                ProductionLot.finished_at,
                ProductionLot.part_revision_id,
            ),
            selectinload(ProductionLot.part).load_only(Part.id, Part.part_no, Part.name),
            selectinload(ProductionLot.po).load_only(PO.id, PO.po_number),
            selectinload(ProductionLot.part_revision),  # .load_only(PartRevision.id, PartRevision.rev)
        )
    )

    # coarsen search: up to 2 tokens, min length 2
    tokens = [t for t in (q or "").split() if len(t) >= 2][:2]
    qry = base
    if tokens:
        qry = qry.join(Part, Part.id == ProductionLot.part_id).outerjoin(PO, PO.id == ProductionLot.po_id)
        for tok in tokens:
            pat = _like_escape(tok)
            qry = qry.filter(or_(
                ProductionLot.lot_no.ilike(pat),
                ProductionLot.status.ilike(pat),
                Part.part_no.ilike(pat),
                Part.name.ilike(pat),
                PO.po_number.ilike(pat),
                PO.description.ilike(pat),
                func.concat("[", func.coalesce(Part.part_no, ""), "] ", func.coalesce(Part.name, "")).ilike(pat),
            ))

    if cursor is not None:
        qry = qry.filter(ProductionLot.id < cursor)

    qry = qry.order_by(ProductionLot.id.desc())
    rows = qry.limit(limit + 1).all()
    page_rows = rows[:limit]
    has_more = len(rows) > limit

    # serialize via schema model_validate (Pydantic v2)
    items: List[ProductionLotOut] = [ProductionLotOut.model_validate(r) for r in page_rows]

    next_cursor = min((r.id for r in page_rows), default=None)  # smallest id on this page
    prev_cursor = None  # (optional) not used by our UI

    return {
        "items": items,
        "next_cursor": next_cursor,
        "prev_cursor": None,
        "has_more": has_more,
    }
@router.get("/{lot_id}", response_model=ProductionLotOut)
def get_lot(lot_id: int, db: Session = Depends(get_db)):
    lot = (
        db.query(ProductionLot)
          .options(
              joinedload(ProductionLot.part),
              joinedload(ProductionLot.po),
              joinedload(ProductionLot.part_revision),
          )
          .filter(ProductionLot.id == lot_id)
          .first()
    )
    if not lot:
        raise HTTPException(404, "Lot not found")
    return lot

@router.put("/{lot_id}", response_model=ProductionLotOut)
def update_lot(lot_id: int, payload: ProductionLotUpdate, db: Session = Depends(get_db)):
    lot = db.get(ProductionLot, lot_id)
    if not lot:
        raise HTTPException(404, "Lot not found")

    data = payload.dict(exclude_unset=True)

    if "lot_no" in data and data["lot_no"]:
        new_no = data["lot_no"].strip().upper()
        dup = db.query(ProductionLot).filter(
            ProductionLot.lot_no == new_no,
            ProductionLot.id != lot_id
        ).first()
        if dup:
            raise HTTPException(409, "Lot number already exists")
        lot.lot_no = new_no
        del data["lot_no"]

    if "po_id" in data and data["po_id"] is not None:
        if not db.get(PO, data["po_id"]):
            raise HTTPException(404, "PO not found")

    if "part_id" in data and data["part_id"] is not None:
        if not db.get(Part, data["part_id"]):
            raise HTTPException(404, "Part not found")

    if "part_revision_id" in data and data["part_revision_id"] is not None:
        prv = db.get(PartRevision, data["part_revision_id"])  # type: ignore[index]
        if not prv:
            raise HTTPException(404, "Part revision not found")
        part_id = data.get("part_id", lot.part_id)
        if prv.part_id != part_id:
            raise HTTPException(400, "part_revision_id does not belong to part_id")

    for k, v in data.items():
        setattr(lot, k, v)

    db.commit()
    db.refresh(lot)
    return _with_joined(db, lot.id)
    

@router.patch("/{lot_id}", response_model=ProductionLotOut)
def update_lot(lot_id: int, payload: ProductionLotUpdate, db: Session = Depends(get_db)):
    lot = db.get(ProductionLot, lot_id)
    if not lot:
        raise HTTPException(404, "Lot not found")

    data = payload.dict(exclude_unset=True)

    if "lot_no" in data and data["lot_no"]:
        new_no = data["lot_no"].strip().upper()
        dup = db.query(ProductionLot).filter(
            ProductionLot.lot_no == new_no,
            ProductionLot.id != lot_id
        ).first()
        if dup:
            raise HTTPException(409, "Lot number already exists")
        lot.lot_no = new_no
        del data["lot_no"]

    if "po_id" in data and data["po_id"] is not None:
        if not db.get(PO, data["po_id"]):
            raise HTTPException(404, "PO not found")

    if "part_id" in data and data["part_id"] is not None:
        if not db.get(Part, data["part_id"]):
            raise HTTPException(404, "Part not found")

    if "part_revision_id" in data and data["part_revision_id"] is not None:
        prv = db.get(PartRevision, data["part_revision_id"])  # type: ignore[index]
        if not prv:
            raise HTTPException(404, "Part revision not found")
        part_id = data.get("part_id", lot.part_id)
        if prv.part_id != part_id:
            raise HTTPException(400, "part_revision_id does not belong to part_id")

    for k, v in data.items():
        setattr(lot, k, v)

    db.commit()
    db.refresh(lot)
    return _with_joined(db, lot.id)

@router.delete("/{lot_id}")
def delete_lot(lot_id: int, db: Session = Depends(get_db)):
    lot = db.get(ProductionLot, lot_id)
    if not lot:
        raise HTTPException(404, "Lot not found")
    if lot.material_uses and len(lot.material_uses) > 0:
        raise HTTPException(400, "Lot has material usage; cannot delete")
    db.delete(lot); db.commit()
    return {"message": "Lot deleted"}


from models import LotMaterialUse, RawBatch, RawMaterial, Supplier, MaterialPO

# ----- place this route anywhere before the file ends -----
@router.get("/used-materials")
def used_materials(
    lot_ids: str = Query(..., description="comma-separated lot ids, e.g. 1,2,3"),
    db: Session = Depends(get_db),
):
    # parse "1,2,3" -> [1,2,3]
    try:
        ids = [int(x) for x in lot_ids.split(",") if x.strip()]
    except ValueError:
        raise HTTPException(400, "lot_ids must be comma-separated integers")
    if not ids:
        return {}

    # Query LotMaterialUse joined to related tables
    rows = (
        db.query(
            LotMaterialUse.lot_id,
            RawMaterial.code.label("material_code"),
            RawBatch.batch_no,
            LotMaterialUse.qty,
            LotMaterialUse.uom,
            Supplier.name.label("supplier"),
            MaterialPO.po_number.label("po_number"),
        )
        .join(RawBatch, RawBatch.id == LotMaterialUse.batch_id)
        .join(RawMaterial, RawMaterial.id == LotMaterialUse.raw_material_id)
        .outerjoin(Supplier, Supplier.id == RawBatch.supplier_id)
        .outerjoin(MaterialPO, MaterialPO.id == RawBatch.po_id)
        .filter(LotMaterialUse.lot_id.in_(ids))
        .order_by(
            LotMaterialUse.lot_id.asc(),
            RawMaterial.code.asc(),
            RawBatch.batch_no.asc(),
        )
        .all()
    )

    # group by lot_id to the shape frontend expects
    out: dict[int, list[dict]] = {i: [] for i in ids}
    for r in rows:
        out[int(r.lot_id)].append(
            {
                "material_code": r.material_code or "",
                "batch_no": r.batch_no or "",
                "qty": float(r.qty) if r.qty is not None else None,
                "uom": r.uom,
                "supplier": r.supplier,
                "po_number": r.po_number,
            }
        )
    return out