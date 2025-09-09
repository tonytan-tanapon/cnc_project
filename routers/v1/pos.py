# routers/pos.py
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from typing import List
from decimal import Decimal   # ✅ แก้ error นี้
from datetime import date as _date
from database import get_db
from models import PO, Customer
from schemas import POCreate, POUpdate, POOut
from utils.code_generator import next_code_yearly

router = APIRouter(prefix="/pos", tags=["pos"])

# ================== PO Lines (Pydantic v2 clean) ==================
from decimal import Decimal
from datetime import date as _date
from typing import List

from pydantic import BaseModel, Field, ConfigDict, model_validator
from fastapi import HTTPException, Depends
from sqlalchemy.orm import Session

from models import PO, POLine, Part, PartRevision
from database import get_db

# -------- Schemas (v2) --------
class PoLineBase(BaseModel):
    qty_ordered: Decimal | None = Field(default=None, ge=0)
    unit_price: Decimal | None = Field(default=None, ge=0)
    due_date: _date | None = None
    notes: str | None = None

    # ระบุ part ได้ 2 ทาง
    part_id: int | None = None
    part_code: str | None = None

    # ระบุ rev ได้ 2 ทาง (optional)
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


# -------- Helpers --------
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


# -------- Routes --------
@router.get("/{po_id}/lines", response_model=List[PoLineOut])
def list_po_lines(po_id: int, db: Session = Depends(get_db)):
    po = db.get(PO, po_id)
    if not po:
        raise HTTPException(404, "PO not found")

    rows = (
        db.query(POLine)
        .filter(POLine.po_id == po_id)
        .order_by(POLine.id.desc())
        .all()
    )

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
    db.add(line)
    db.commit()
    db.refresh(line)

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

    if payload.qty_ordered is not None:
        line.qty_ordered = payload.qty_ordered
    if payload.unit_price is not None:
        line.unit_price = payload.unit_price
    if payload.due_date is not None:
        line.due_date = payload.due_date
    if payload.notes is not None:
        line.notes = payload.notes

    db.commit()
    db.refresh(line)

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

    # ตัวอย่าง guard ถ้ามีลิงก์ไป ProductionLot ในอนาคต
    # if db.query(ProductionLot).filter(ProductionLot.po_line_id == line_id).first():
    #     raise HTTPException(400, "Line linked to lot; cannot delete")

    db.delete(line)
    db.commit()
    return {"message": "Line deleted"}
