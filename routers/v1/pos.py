# routers/v1/pos.py
from __future__ import annotations

from typing import List, Optional, Tuple
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, ConfigDict
from sqlalchemy import or_
from sqlalchemy.orm import Session, joinedload

from database import get_db
from models import PO, POLine, Customer, Part, PartRevision

# export ตาม __init__.py
pos_router = APIRouter(prefix="/pos", tags=["pos"])

# ---------- Helpers ----------
def _next_po_number_yearly(db: Session) -> str:
    """Generate PO number like PO25-0001 based on current year."""
    yy = datetime.now().strftime("%y")
    prefix = f"PO{yy}-"
    last = (
        db.query(PO.po_number)
        .filter(PO.po_number.like(prefix + "%"))
        .order_by(PO.po_number.desc())
        .first()
    )
    if last and last[0].startswith(prefix):
        try:
            n = int(last[0].split("-")[-1]) + 1
        except Exception:
            n = 1
    else:
        n = 1
    return f"{prefix}{n:04d}"

def _paginate(query, page: int, page_size: int) -> Tuple[list[PO], int]:
    total = query.count()
    items = query.offset((page - 1) * page_size).limit(page_size).all()
    return items, total

# ---------- Schemas ----------
class CustomerBrief(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    code: str
    name: str

class PoCreate(BaseModel):
    customer_id: int
    description: str = ""               # ← ใช้ description
    po_number: Optional[str] = None

class PoUpdate(BaseModel):
    customer_id: Optional[int] = None
    description: Optional[str] = None   # ← ใช้ description

class PoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    po_number: str
    customer: CustomerBrief
    description: Optional[str] = None   # ← ใช้ description
    created_at: Optional[datetime] = None

class PartBrief(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    part_no: str
    name: Optional[str] = None

class RevBrief(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    rev: str

class PoLineCreate(BaseModel):
    part_id: int
    revision_id: Optional[int] = Field(default=None, description="If provided, must belong to part_id")
    qty: float = 1
    unit_price: float = 0
    note: str = ""

class PoLineUpdate(BaseModel):
    part_id: Optional[int] = None
    revision_id: Optional[int] = None
    qty: Optional[float] = None
    unit_price: Optional[float] = None
    note: Optional[str] = None

class PoLineOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    po_id: int
    part: PartBrief
    revision: Optional[RevBrief] = None
    qty: float
    unit_price: float
    amount: float
    note: Optional[str] = None

# ---------- PO (header) ----------
@pos_router.get("/", response_model=dict)
def list_pos(
    q: Optional[str] = Query(default=None, description="po_number/customer code/name"),
    page: int = 1,
    page_size: int = 20,
    db: Session = Depends(get_db),
):
    query = db.query(PO).options(joinedload(PO.customer))
    if q:
        like = f"%{q}%"
        query = query.join(Customer).filter(
            or_(
                PO.po_number.ilike(like),
                Customer.code.ilike(like),
                Customer.name.ilike(like),
            )
        )
    items, total = _paginate(query.order_by(PO.id.desc()), page, page_size)
    data = [PoOut.model_validate(i) for i in items]
    return {"items": data, "total": total, "page": page, "page_size": page_size}

@pos_router.post("/", response_model=PoOut, status_code=201)
def create_po(payload: PoCreate, db: Session = Depends(get_db)):
    cust = db.query(Customer).get(payload.customer_id)
    if not cust:
        raise HTTPException(404, "Customer not found")

    po_number = payload.po_number or _next_po_number_yearly(db)
    po = PO(
        po_number=po_number,
        customer_id=cust.id,
        description=payload.description,   # ← ตรงนี้
    )
    db.add(po)
    db.commit()
    db.refresh(po)
    return PoOut.model_validate(po)

@pos_router.patch("/{po_id}", response_model=PoOut)
def update_po(po_id: int, payload: PoUpdate, db: Session = Depends(get_db)):
    po = db.query(PO).get(po_id)
    if not po:
        raise HTTPException(404, "PO not found")

    if payload.customer_id is not None:
        cust = db.query(Customer).get(payload.customer_id)
        if not cust:
            raise HTTPException(404, "Customer not found")
        po.customer_id = payload.customer_id

    if payload.description is not None:      # ← ตรงนี้
        po.description = payload.description

    db.commit()
    db.refresh(po)
    return PoOut.model_validate(po)

@pos_router.get("/{po_id}", response_model=PoOut)
def get_po(po_id: int, db: Session = Depends(get_db)):
    po = db.query(PO).options(joinedload(PO.customer)).get(po_id)
    if not po:
        raise HTTPException(404, "PO not found")
    return PoOut.model_validate(po)



@pos_router.delete("/{po_id}", status_code=204)
def delete_po(po_id: int, db: Session = Depends(get_db)):
    po = db.query(PO).get(po_id)
    if not po:
        raise HTTPException(404, "PO not found")
    db.delete(po)
    db.commit()
    return None

# ---------- PO Lines ----------
@pos_router.get("/{po_id}/lines", response_model=List[PoLineOut])
def list_lines(po_id: int, db: Session = Depends(get_db)):
    po = db.query(PO).get(po_id)
    if not po:
        raise HTTPException(404, "PO not found")

    rows: List[POLine] = (
        db.query(POLine)
        .options(joinedload(POLine.part), joinedload(POLine.rev))
        .filter(POLine.po_id == po_id)
        .order_by(POLine.id)
        .all()
    )

    out: List[PoLineOut] = []
    for r in rows:
        amount = float(r.qty_ordered or 0) * float(r.unit_price or 0)
        out.append(
            PoLineOut(
                id=r.id,
                po_id=r.po_id,
                part=r.part,
                revision=r.rev,
                qty=float(r.qty_ordered or 0),
                unit_price=float(r.unit_price or 0),
                amount=amount,
                note=r.notes,
            )
        )
    return out

@pos_router.post("/{po_id}/lines", response_model=PoLineOut, status_code=201)
def create_line(po_id: int, payload: PoLineCreate, db: Session = Depends(get_db)):
    po = db.query(PO).get(po_id)
    if not po:
        raise HTTPException(404, "PO not found")

    part = db.query(Part).get(payload.part_id)
    if not part:
        raise HTTPException(404, "Part not found")

    rev = None
    if payload.revision_id is not None:
        rev = db.query(PartRevision).get(payload.revision_id)
        if not rev or rev.part_id != part.id:
            raise HTTPException(400, "revision_id does not belong to part_id")

    line = POLine(
        po_id=po.id,
        part_id=part.id,
        revision_id=rev.id if rev else None,
        qty_ordered=payload.qty,          # ✅ ใช้ qty_ordered
        unit_price=payload.unit_price,
        notes=payload.note,               # ✅ ใช้ notes
        # due_date=... (ถ้าจะรองรับในอนาคต)
    )
    db.add(line)
    db.commit()
    db.refresh(line)

    amount = float(line.qty_ordered or 0) * float(line.unit_price or 0)
    return PoLineOut(
        id=line.id,
        po_id=line.po_id,
        part=line.part,
        revision=line.rev,
        qty=float(line.qty_ordered or 0),
        unit_price=float(line.unit_price or 0),
        amount=amount,
        note=line.notes,
    )

@pos_router.patch("/{po_id}/lines/{line_id}", response_model=PoLineOut)
def update_line(po_id: int, line_id: int, payload: PoLineUpdate, db: Session = Depends(get_db)):
    line = db.query(POLine).get(line_id)
    if not line or line.po_id != po_id:
        raise HTTPException(404, "Line not found")

    if payload.part_id is not None:
        part = db.query(Part).get(payload.part_id)
        if not part:
            raise HTTPException(404, "Part not found")
        line.part_id = part.id

        if line.revision_id:
            rev = db.query(PartRevision).get(line.revision_id)
            if not rev or rev.part_id != part.id:
                raise HTTPException(400, "Existing revision doesn't match new part")

    if payload.revision_id is not None:
        if payload.revision_id == 0:
            line.revision_id = None
        else:
            rev = db.query(PartRevision).get(payload.revision_id)
            if not rev or rev.part_id != line.part_id:
                raise HTTPException(400, "revision_id does not belong to part_id")
            line.revision_id = rev.id

    if payload.qty is not None:
        line.qty_ordered = payload.qty          # ✅
    if payload.unit_price is not None:
        line.unit_price = payload.unit_price
    if payload.note is not None:
        line.notes = payload.note               # ✅

    db.commit()
    db.refresh(line)
    amount = float(line.qty_ordered or 0) * float(line.unit_price or 0)
    return PoLineOut(
        id=line.id,
        po_id=line.po_id,
        part=line.part,
        revision=line.rev,                      # ✅ เดิมใช้ line.revision (ผิด attr)
        qty=float(line.qty_ordered or 0),
        unit_price=float(line.unit_price or 0),
        amount=amount,
        note=line.notes,
    )

@pos_router.delete("/{po_id}/lines/{line_id}", status_code=204)
def delete_line(po_id: int, line_id: int, db: Session = Depends(get_db)):
    line = db.query(POLine).get(line_id)
    if not line or line.po_id != po_id:
        raise HTTPException(404, "Line not found")
    db.delete(line)
    db.commit()
    return None
