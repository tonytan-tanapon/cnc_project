# routers/pos.py
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from sqlalchemy import or_
from typing import List, Optional

from database import get_db
from models import PO, Customer, POLine, Part, PartRevision
from schemas import POCreate, POUpdate, POOut
from utils.code_generator import next_code_yearly

# ================= Router =================
router = APIRouter(prefix="/pos", tags=["pos"])

# ---------- Cursor page schema ----------
from pydantic import BaseModel, ConfigDict
class POListCursor(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    items: List[POOut]
    next_cursor: int | None = None
    prev_cursor: int | None = None
    has_more: bool

# ---------- Create PO ----------
@router.post("", response_model=POOut)
def create_po(payload: POCreate, db: Session = Depends(get_db)):
    raw = (payload.po_number or "").strip().upper()
    autogen = raw in ("", "AUTO", "AUTOGEN")
    po_no = next_code_yearly(db, PO, "po_number", prefix="PO") if autogen else raw

    if db.query(PO).filter(PO.po_number == po_no).first():
        raise HTTPException(409, "PO number already exists")

    if not db.get(Customer, payload.customer_id):
        raise HTTPException(400, "customer_id not found")

    po = PO(
        po_number=po_no,
        description=payload.description,
        customer_id=payload.customer_id,
    )

    # กัน race condition ตอน autogen
    for _ in range(3):
        try:
            db.add(po); db.commit(); db.refresh(po)
            return po
        except IntegrityError:
            db.rollback()
            if autogen:
                po.po_number = next_code_yearly(db, PO, "po_number", prefix="PO")
            else:
                raise HTTPException(409, "PO number already exists")
    raise HTTPException(500, "Failed to generate unique PO number")

# ---------- (Backward-compat) Offset list ทั้งก้อน (OPTIONAL) ----------
# เดิมคุณเคยคืนทุกแถว; คงไว้ได้แต่ไม่แนะนำใช้กับข้อมูลเยอะ
@router.get("", response_model=List[POOut])
def list_pos(db: Session = Depends(get_db)):
    return db.query(PO).order_by(PO.id.desc()).all()

# ---------- Keyset (cursor) list ----------
@router.get("/keyset", response_model=POListCursor)
def list_pos_keyset(
    q: Optional[str] = Query(None, description="Search by po_number/description/customer code/name (ILIKE)"),
    limit: int = Query(25, ge=1, le=200),
    cursor: Optional[int] = Query(None, description="Fetch rows with id > cursor (next page)"),
    before: Optional[int] = Query(None, description="Fetch rows with id < before (previous page)"),
    db: Session = Depends(get_db),
):
    """
    Bidirectional keyset:
      - First page: no cursor/before (ASC)
      - Next:  cursor=<last_id>
      - Prev:  before=<first_id>
    Always return ASC.
    """
    qry = db.query(PO).join(Customer, PO.customer_id == Customer.id, isouter=True)

    if q and q.strip():
        like = f"%{q.strip()}%"
        qry = qry.filter(
            or_(
                PO.po_number.ilike(like),
                PO.description.ilike(like),
                Customer.code.ilike(like),
                Customer.name.ilike(like),
            )
        )

    going_prev = before is not None and cursor is None
    if going_prev:
        qry = qry.filter(PO.id < before).order_by(PO.id.desc())
    else:
        if cursor is not None:
            qry = qry.filter(PO.id > cursor)
        qry = qry.order_by(PO.id.asc())

    rows = qry.limit(limit + 1).all()
    if going_prev:
        rows = list(reversed(rows))

    page_rows = rows[:limit]
    has_more = len(rows) > limit

    items = [POOut.model_validate(r, from_attributes=True) for r in page_rows]
    next_cursor = page_rows[-1].id if page_rows else None
    prev_cursor = page_rows[0].id if page_rows else None

    return {
        "items": items,
        "next_cursor": next_cursor,
        "prev_cursor": prev_cursor,
        "has_more": has_more,
    }

# ---------- CRUD by id ----------
@router.get("/{po_id}", response_model=POOut)
def get_po(po_id: int, db: Session = Depends(get_db)):
    po = db.get(PO, po_id)
    if not po:
        raise HTTPException(404, "PO not found")
    return po

@router.put("/{po_id}", response_model=POOut)
def update_po(po_id: int, payload: POUpdate, db: Session = Depends(get_db)):
    po = db.get(PO, po_id)
    if not po:
        raise HTTPException(404, "PO not found")

    data = payload.dict(exclude_unset=True)

    if "po_number" in data and data["po_number"]:
        new_no = data["po_number"].strip().upper()
        dup = db.query(PO).filter(PO.po_number == new_no, PO.id != po_id).first()
        if dup:
            raise HTTPException(409, "PO number already exists")
        po.po_number = new_no
        del data["po_number"]

    if "customer_id" in data and data["customer_id"] is not None:
        if not db.get(Customer, data["customer_id"]):
            raise HTTPException(400, "customer_id not found")

    for k, v in data.items():
        setattr(po, k, v)

    db.commit(); db.refresh(po)
    return po

@router.delete("/{po_id}")
def delete_po(po_id: int, db: Session = Depends(get_db)):
    po = db.get(PO, po_id)
    if not po:
        raise HTTPException(404, "PO not found")
    if po.lots:
        raise HTTPException(400, "PO has lots; cannot delete")
    db.delete(po); db.commit()
    return {"message": "PO deleted"}

# ================== PO Lines (Pydantic v2 clean) ==================
from decimal import Decimal
from datetime import date as _date
from pydantic import BaseModel, Field, ConfigDict, model_validator

# ---- Schemas ----
class PoLineBase(BaseModel):
    qty_ordered: Decimal | None = Field(default=None, ge=0)
    unit_price: Decimal | None = Field(default=None, ge=0)
    due_date: _date | None = None
    notes: str | None = None
    part_id: int | None = None
    part_code: str | None = None
    revision_id: int | None = None
    rev: str | None = None

class PoLineCreate(PoLineBase):
    @model_validator(mode="after")
    def _must_have_part(self):
        if self.part_id is None and not (self.part_code and self.part_code.strip()):
            raise ValueError("Either part_id or part_code is required")
        return self

class PoLineUpdate(PoLineBase):
    pass

class PartBrief(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    part_no: str

class RevBrief(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    rev: str

class PoLineOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    po_id: int
    part_id: int | None
    revision_id: int | None
    qty_ordered: Decimal | None
    unit_price: Decimal | None
    due_date: _date | None
    notes: str | None
    part: PartBrief | None = None
    rev: RevBrief | None = None

# ---- Helpers ----
def _resolve_part_and_rev(
    db: Session,
    part_id: int | None,
    part_code: str | None,
    revision_id: int | None,
    rev: str | None,
):
    # part
    part_obj: Part | None = None
    if part_id:
        part_obj = db.get(Part, part_id)
        if not part_obj:
            raise HTTPException(400, f"part_id {part_id} not found")
    else:
        code = (part_code or "").strip()
        part_obj = db.query(Part).filter(Part.part_no == code).first()
        if not part_obj:
            raise HTTPException(400, f"part_code '{code}' not found")

    # revision (optional)
    rev_obj: PartRevision | None = None
    if revision_id:
        rev_obj = db.get(PartRevision, revision_id)
        if not rev_obj:
            raise HTTPException(400, f"revision_id {revision_id} not found")
        if rev_obj.part_id != part_obj.id:
            raise HTTPException(400, "revision_id does not belong to part")
    elif rev:
        _rev = rev.strip()
        rev_obj = db.query(PartRevision).filter(
            PartRevision.part_id == part_obj.id,
            PartRevision.rev == _rev
        ).first()
        if not rev_obj:
            raise HTTPException(400, f"rev '{_rev}' not found for this part")

    return part_obj.id, (rev_obj.id if rev_obj else None), part_obj, rev_obj

# ---- Routes ----
@router.get("/{po_id}/lines", response_model=List[PoLineOut])
def list_po_lines(po_id: int, db: Session = Depends(get_db)):
    po = db.get(PO, po_id)
    if not po:
        raise HTTPException(404, "PO not found")

    rows = db.query(POLine).filter(POLine.po_id == po_id).order_by(POLine.id.desc()).all()
    out: list[PoLineOut] = []
    for r in rows:
        out.append(
            PoLineOut.model_validate(r, from_attributes=True).model_copy(
                update={
                    "part": PartBrief.model_validate(r.part, from_attributes=True) if r.part else None,
                    "rev":  RevBrief.model_validate(r.rev,  from_attributes=True) if r.rev  else None,
                }
            )
        )
    return out

@router.post("/{po_id}/lines", response_model=PoLineOut)
def create_po_line(po_id: int, payload: PoLineCreate, db: Session = Depends(get_db)):
    po = db.get(PO, po_id)
    if not po:
        raise HTTPException(404, "PO not found")

    p_id, r_id, p_obj, r_obj = _resolve_part_and_rev(
        db, payload.part_id, payload.part_code, payload.revision_id, payload.rev
    )

    line = POLine(
        po_id=po_id,
        part_id=p_id,
        revision_id=r_id,
        qty_ordered=payload.qty_ordered or 0,
        unit_price=payload.unit_price,
        due_date=payload.due_date,
        notes=payload.notes,
    )
    db.add(line); db.commit(); db.refresh(line)

    return PoLineOut.model_validate(line, from_attributes=True).model_copy(
        update={
            "part": PartBrief.model_validate(p_obj, from_attributes=True) if p_obj else None,
            "rev":  RevBrief.model_validate(r_obj, from_attributes=True) if r_obj else None,
        }
    )

@router.put("/{po_id}/lines/{line_id}", response_model=PoLineOut)
def update_po_line(po_id: int, line_id: int, payload: PoLineUpdate, db: Session = Depends(get_db)):
    po = db.get(PO, po_id)
    if not po:
        raise HTTPException(404, "PO not found")
    line = db.get(POLine, line_id)
    if not line or line.po_id != po_id:
        raise HTTPException(404, "Line not found")

    part_obj = None
    rev_obj = None
    if any([payload.part_id, payload.part_code, payload.revision_id, payload.rev]):
        p_id, r_id, part_obj, rev_obj = _resolve_part_and_rev(
            db, payload.part_id, payload.part_code, payload.revision_id, payload.rev
        )
        line.part_id = p_id
        line.revision_id = r_id

    if payload.qty_ordered is not None: line.qty_ordered = payload.qty_ordered
    if payload.unit_price is not None:  line.unit_price = payload.unit_price
    if payload.due_date is not None:    line.due_date = payload.due_date
    if payload.notes is not None:       line.notes = payload.notes

    db.commit(); db.refresh(line)
    return PoLineOut.model_validate(line, from_attributes=True).model_copy(
        update={
            "part": PartBrief.model_validate(part_obj or line.part, from_attributes=True)
                    if (part_obj or line.part) else None,
            "rev":  RevBrief.model_validate(rev_obj  or line.rev,  from_attributes=True)
                    if (rev_obj  or line.rev)  else None,
        }
    )

@router.delete("/{po_id}/lines/{line_id}")
def delete_po_line(po_id: int, line_id: int, db: Session = Depends(get_db)):
    po = db.get(PO, po_id)
    if not po:
        raise HTTPException(404, "PO not found")
    line = db.get(POLine, line_id)
    if not line or line.po_id != po_id:
        raise HTTPException(404, "Line not found")

    db.delete(line); db.commit()
    return {"message": "Line deleted"}
