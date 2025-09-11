# routers/batches.py
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy.exc import IntegrityError
from sqlalchemy import or_, func, desc
from typing import List, Optional
from decimal import Decimal
from pydantic import BaseModel

from database import get_db
from models import RawMaterial, RawBatch
from schemas import RawBatchCreate, RawBatchUpdate, RawBatchOut
from utils.code_generator import next_code  # same helper used by customers/materials
from sqlalchemy.orm import joinedload
from sqlalchemy import or_, func, desc
router = APIRouter(prefix="/batches", tags=["batches"])

# ---------- Page (offset) ----------
class BatchPage(BaseModel):
    items: List[RawBatchOut]
    total: int
    page: int
    per_page: int
    pages: int

# ---------- Mini for lookup ----------
class BatchMini(BaseModel):
    id: int
    batch_no: Optional[str] = None
    material_id: Optional[int] = None
    class Config:
        from_attributes = True  # Pydantic v2

# ---------- Cursor page (keyset DESC: new -> old) ----------
class BatchCursorPage(BaseModel):
    items: List[RawBatchOut]
    next_cursor: Optional[int] = None   # go older
    prev_cursor: Optional[int] = None   # go newer
    has_more: bool

# ---------- helpers ----------
def _like_escape(term: str) -> str:
    """Escape % and _ for ILIKE and wrap with wildcards."""
    esc = term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{esc}%"

# ---------- next batch number (optional for AUTOGEN in UI) ----------
@router.get("/next-no")
def get_next_batch_no(prefix: str = "B", width: int = 5, db: Session = Depends(get_db)):
    return {"next_no": next_code(db, RawBatch, "batch_no", prefix=prefix, width=width)}

# ---------- CREATE (supports AUTO/AUTOGEN/empty batch_no) ----------
@router.post("", response_model=RawBatchOut)
def create_batch(payload: RawBatchCreate, db: Session = Depends(get_db)):
    # material must exist
    if not db.get(RawMaterial, payload.material_id):
        raise HTTPException(404, "Material not found")

    raw_no = (payload.batch_no or "").strip().upper()
    autogen = raw_no in ("", "AUTO", "AUTOGEN")
    batch_no = next_code(db, RawBatch, "batch_no", prefix="B", width=5) if autogen else raw_no

    b = RawBatch(
        material_id=payload.material_id,
        batch_no=batch_no,
        supplier_id=payload.supplier_id,
        supplier_batch_no=payload.supplier_batch_no,
        mill_name=payload.mill_name,
        mill_heat_no=payload.mill_heat_no,
        received_at=payload.received_at,
        qty_received=payload.qty_received,
        qty_used=Decimal("0"),
        cert_file=payload.cert_file,
        location=payload.location,
    )

    for _ in range(3):
        try:
            db.add(b); db.commit(); db.refresh(b)
            return b
        except IntegrityError:
            db.rollback()
            if autogen:
                b.batch_no = next_code(db, RawBatch, "batch_no", prefix="B", width=5)
            else:
                raise HTTPException(409, "Batch number already exists")
    raise HTTPException(500, "Failed to generate unique batch number")

# ---------- LIST (OFFSET) ----------
@router.get("", response_model=BatchPage)
def list_batches(
    q: Optional[str] = Query(None, description="Search by batch/material (ILIKE)"),
    material_id: Optional[int] = Query(None, description="Filter by material_id"),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    qry = (
        db.query(RawBatch)
        .join(RawMaterial, RawMaterial.id == RawBatch.material_id)  # enable material search
        .options(joinedload(RawBatch.material))                     # return nested material
    )

    if material_id:
        qry = qry.filter(RawBatch.material_id == material_id)

    if q and q.strip():
        # AND semantics per token
        for tok in q.strip().split():
            pat = _like_escape(tok)  # make sure this helper exists
            qry = qry.filter(or_(
                RawBatch.batch_no.ilike(pat),
                RawBatch.supplier_batch_no.ilike(pat),
                RawBatch.mill_name.ilike(pat),
                RawBatch.mill_heat_no.ilike(pat),
                RawBatch.location.ilike(pat),
                RawMaterial.code.ilike(pat),
                RawMaterial.name.ilike(pat),
                RawMaterial.spec.ilike(pat),
                func.concat(
                    "[", func.coalesce(RawMaterial.code, ""), "] ",
                    func.coalesce(RawMaterial.name, "")
                ).ilike(pat),
            ))

    total = qry.count()
    items = (qry.order_by(RawBatch.id.desc())
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

# ---------- LIST (KEYSET DESC: newest -> oldest) ----------
@router.get("/keyset", response_model=BatchCursorPage)
def list_batches_keyset(
    q: Optional[str] = Query(None, description="Search by batch/material (ILIKE)"),
    material_id: Optional[int] = Query(None, description="Filter by material_id"),
    limit: int = Query(25, ge=1, le=200),
    cursor: Optional[int] = Query(None, description="(DESC) Next page (older): id < cursor"),
    before: Optional[int] = Query(None, description="(DESC) Prev page (newer): id > before"),
    db: Session = Depends(get_db),
):
    qry = (
        db.query(RawBatch)
        .join(RawMaterial, RawMaterial.id == RawBatch.material_id)
        .options(joinedload(RawBatch.material))
    )

    if material_id:
        qry = qry.filter(RawBatch.material_id == material_id)

    if q and q.strip():
        # AND semantics per token
        for tok in q.strip().split():
            pat = _like_escape(tok)
            qry = qry.filter(or_(
                RawBatch.batch_no.ilike(pat),
                RawBatch.supplier_batch_no.ilike(pat),
                RawBatch.mill_name.ilike(pat),
                RawBatch.mill_heat_no.ilike(pat),
                RawBatch.location.ilike(pat),
                RawMaterial.code.ilike(pat),
                RawMaterial.name.ilike(pat),
                RawMaterial.spec.ilike(pat),
                func.concat(
                    "[", func.coalesce(RawMaterial.code, ""), "] ",
                    func.coalesce(RawMaterial.name, "")
                ).ilike(pat),
            ))
        # Optional: quick numeric match for convenience
        if q.strip().isdigit():
            num = int(q.strip())
            qry = qry.filter(or_(RawBatch.id == num, RawBatch.material_id == num))

    # paging
    going_prev = before is not None and cursor is None
    if going_prev:
        # go newer: id > before
        qry = qry.filter(RawBatch.id > before).order_by(RawBatch.id.asc())
        rows = qry.limit(limit + 1).all()
        rows = list(reversed(rows))  # present in DESC order
    else:
        # first / go older: id < cursor
        if cursor is not None:
            qry = qry.filter(RawBatch.id < cursor)
        qry = qry.order_by(desc(RawBatch.id))
        rows = qry.limit(limit + 1).all()

    page_rows = rows[:limit]
    has_more = len(rows) > limit
    next_cursor = page_rows[-1].id if page_rows else None  # older
    prev_cursor = page_rows[0].id if page_rows else None   # newer

    items: List[RawBatchOut] = [RawBatchOut.model_validate(r) for r in page_rows]

    return {
        "items": items,
        "next_cursor": next_cursor,
        "prev_cursor": prev_cursor,
        "has_more": has_more,
    }

# ---------- LOOKUP ----------
@router.get("/lookup", response_model=List[BatchMini])
def lookup_batches(ids: str, db: Session = Depends(get_db)):
    try:
        id_list = [int(x) for x in ids.split(",") if x.strip().isdigit()]
    except Exception:
        id_list = []
    if not id_list:
        return []
    rows = db.query(RawBatch).filter(RawBatch.id.in_(id_list)).all()
    return rows

# ---------- GET / UPDATE / DELETE ----------
@router.get("/{batch_id}", response_model=RawBatchOut)
def get_batch(batch_id: int, db: Session = Depends(get_db)):
    b = db.get(RawBatch, batch_id)
    if not b:
        raise HTTPException(404, "Batch not found")
    return b

# routers/batches.py (update_batch)
@router.put("/{batch_id}", response_model=RawBatchOut)
def update_batch(batch_id: int, payload: RawBatchUpdate, db: Session = Depends(get_db)):
    b = db.get(RawBatch, batch_id)
    if not b:
        raise HTTPException(404, "Batch not found")

    data = payload.dict(exclude_unset=True)

    # material change (optional rule: forbid when used > 0)
    if "material_id" in data and data["material_id"] is not None:
        new_mid = int(data["material_id"])
        if not db.get(RawMaterial, new_mid):
            raise HTTPException(404, "Material not found")
        # if you want to forbid changing when used:
        # if (b.qty_used or Decimal("0")) > 0:
        #     raise HTTPException(400, "Cannot change material on a used batch")
        b.material_id = new_mid
        del data["material_id"]

    # qty_received (must be >= current or target qty_used)
    if "qty_received" in data and data["qty_received"] is not None:
        new_recv = Decimal(str(data["qty_received"]))
        current_used = b.qty_used or Decimal("0")
        if new_recv < current_used:
            raise HTTPException(400, "qty_received cannot be less than qty_used")
        b.qty_received = new_recv
        del data["qty_received"]

    # qty_used (0 ≤ used ≤ qty_received)
    if "qty_used" in data and data["qty_used"] is not None:
        new_used = Decimal(str(data["qty_used"]))
        if new_used < 0:
            raise HTTPException(400, "qty_used cannot be negative")
        recv = b.qty_received or Decimal("0")
        if new_used > recv:
            raise HTTPException(400, "qty_used cannot exceed qty_received")
        b.qty_used = new_used
        del data["qty_used"]

    # other fields
    for k, v in data.items():
        setattr(b, k, v)

    db.commit()
    db.refresh(b)
    return b

@router.delete("/{batch_id}")
def delete_batch(batch_id: int, db: Session = Depends(get_db)):
    b = db.get(RawBatch, batch_id)
    if not b:
        raise HTTPException(404, "Batch not found")
    if (b.qty_used or Decimal("0")) > 0 or (getattr(b, "uses", []) and len(b.uses) > 0):
        raise HTTPException(400, "Batch already used; cannot delete")
    db.delete(b); db.commit()
    return {"message": "Batch deleted"}
