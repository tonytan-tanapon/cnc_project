# routers/pos.py
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from typing import List

from database import get_db
from models import PO, Customer
from schemas import POCreate, POUpdate, POOut
from utils.code_generator import next_code_yearly

router = APIRouter(prefix="/pos", tags=["pos"])


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
    print(po)
    # กัน race condition ตอน autogen
    for _ in range(3):
        try:
            db.add(po)
            db.commit()
            db.refresh(po)
            return po
        except IntegrityError:
            db.rollback()
            if autogen:
                po.po_number = next_code_yearly(db, PO, "po_number", prefix="PO")
            else:
                raise HTTPException(409, "PO number already exists")

    raise HTTPException(500, "Failed to generate unique PO number")


@router.get("", response_model=List[POOut])
def list_pos(db: Session = Depends(get_db)):
    return db.query(PO).order_by(PO.id.desc()).all()


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

    # เปลี่ยนเลข PO ต้องไม่ซ้ำ
    if "po_number" in data and data["po_number"]:
        new_no = data["po_number"].strip().upper()
        dup = db.query(PO).filter(PO.po_number == new_no, PO.id != po_id).first()
        if dup:
            raise HTTPException(409, "PO number already exists")
        po.po_number = new_no
        del data["po_number"]

    # เปลี่ยน customer_id ต้องมีอยู่จริง
    if "customer_id" in data and data["customer_id"] is not None:
        if not db.get(Customer, data["customer_id"]):
            raise HTTPException(400, "customer_id not found")

    for k, v in data.items():
        setattr(po, k, v)

    db.commit()
    db.refresh(po)
    return po


@router.delete("/{po_id}")
def delete_po(po_id: int, db: Session = Depends(get_db)):
    po = db.get(PO, po_id)
    if not po:
        raise HTTPException(404, "PO not found")
    if po.lots:
        raise HTTPException(400, "PO has lots; cannot delete")
    db.delete(po)
    db.commit()
    return {"message": "PO deleted"}


## po line
# routers/pos.py (ต่อจากของเดิม)
from datetime import date as _date
from decimal import Decimal
from pydantic import BaseModel, Field, validator
from models import PO, POLine, Part, PartRevision

# -------- Schemas --------
class PoLineBase(BaseModel):
  part_id: int | None = None
  revision_id: int | None = None
  part_code: str | None = None      # alternative to part_id
  rev: str | None = None            # alternative to revision_id
  qty_ordered: Decimal | None = Field(default=None, ge=0)
  unit_price: Decimal | None = Field(default=None, ge=0)
  due_date: _date | None = None
  notes: str | None = None

class PoLineCreate(PoLineBase):
  @validator('part_id', 'part_code', pre=True, always=True)
  def _at_least_part(cls, v, values, **kwargs):
    if v is None and (values.get('part_id') is None and values.get('part_code') is None):
      raise ValueError('Either part_id or part_code is required')
    return v

class PoLineUpdate(PoLineBase):
  pass

class PartBrief(BaseModel):
  id: int
  part_no: str
  class Config: orm_mode = True

class RevBrief(BaseModel):
  id: int
  rev: str
  class Config: orm_mode = True

class PoLineOut(BaseModel):
  id: int
  po_id: int
  part_id: int | None
  revision_id: int | None
  qty_ordered: Decimal | None
  unit_price: Decimal | None
  due_date: _date | None
  notes: str | None
  # รวบรวมข้อมูลอ่านง่าย
  part: PartBrief | None = None
  rev: RevBrief | None = None
  class Config: orm_mode = True

# -------- Helpers --------
def _resolve_part_and_rev(db: Session, part_id: int | None, part_code: str | None,
                          revision_id: int | None, rev: str | None):
  """ยืดหยุ่น: รับได้ทั้ง id หรือ code (และ rev/ revision_id) แล้ว resolve ให้เป็น id ที่ถูกต้อง"""
  part_obj: Part | None = None
  rev_obj: PartRevision | None = None

  if part_id:
    part_obj = db.get(Part, part_id)
  elif part_code:
    part_obj = db.query(Part).filter(Part.part_no == part_code.strip()).first()

  if not part_obj:
    raise HTTPException(400, "part not found")

  if revision_id:
    rev_obj = db.get(PartRevision, revision_id)
    if not rev_obj or rev_obj.part_id != part_obj.id:
      raise HTTPException(400, "revision_id does not belong to part")
  elif rev:
    rev_obj = db.query(PartRevision).filter(
      PartRevision.part_id == part_obj.id,
      PartRevision.rev == rev.strip()
    ).first()
    if not rev_obj:
      # อนุญาตว่างได้ (บาง PO ไม่ระบุ rev)
      rev_obj = None

  return part_obj.id, (rev_obj.id if rev_obj else None), part_obj, rev_obj


# -------- Routes --------
@router.get("/{po_id}/lines", response_model=List[PoLineOut])
def list_po_lines(po_id: int, db: Session = Depends(get_db)):
  po = db.get(PO, po_id)
  if not po: raise HTTPException(404, "PO not found")
  rows = db.query(POLine).filter(POLine.po_id == po_id).order_by(POLine.id.desc()).all()
  # enrich for output
  out: list[PoLineOut] = []
  for r in rows:
    out.append(PoLineOut.from_orm(r).copy(update={
      "part": PartBrief.from_orm(r.part) if r.part else None,
      "rev": RevBrief.from_orm(r.rev) if r.rev else None,
    }))
  return out


@router.post("/{po_id}/lines", response_model=PoLineOut)
def create_po_line(po_id: int, payload: PoLineCreate, db: Session = Depends(get_db)):
  po = db.get(PO, po_id)
  if not po: raise HTTPException(404, "PO not found")

  p_id, r_id, p_obj, r_obj = _resolve_part_and_rev(
    db, payload.part_id, payload.part_code, payload.revision_id, payload.rev
  )

  line = POLine(
    po_id = po_id,
    part_id = p_id,
    revision_id = r_id,
    qty_ordered = payload.qty_ordered or 0,
    unit_price = payload.unit_price,
    due_date = payload.due_date,
    notes = payload.notes
  )
  db.add(line)
  db.commit()
  db.refresh(line)
  return PoLineOut.from_orm(line).copy(update={
    "part": PartBrief.from_orm(p_obj) if p_obj else None,
    "rev": RevBrief.from_orm(r_obj) if r_obj else None,
  })


@router.put("/{po_id}/lines/{line_id}", response_model=PoLineOut)
def update_po_line(po_id: int, line_id: int, payload: PoLineUpdate, db: Session = Depends(get_db)):
  po = db.get(PO, po_id)
  if not po: raise HTTPException(404, "PO not found")
  line = db.get(POLine, line_id)
  if not line or line.po_id != po_id:
    raise HTTPException(404, "Line not found")

  # ถ้าส่ง part/rev มา จะ resolve แล้วตั้งค่าใหม่
  part_obj = None; rev_obj = None
  if any([payload.part_id, payload.part_code, payload.revision_id, payload.rev]):
    p_id, r_id, part_obj, rev_obj = _resolve_part_and_rev(
      db, payload.part_id, payload.part_code, payload.revision_id, payload.rev
    )
    line.part_id = p_id
    line.revision_id = r_id

  if payload.qty_ordered is not None: line.qty_ordered = payload.qty_ordered
  if payload.unit_price is not None: line.unit_price = payload.unit_price
  if payload.due_date is not None: line.due_date = payload.due_date
  if payload.notes is not None: line.notes = payload.notes

  db.commit()
  db.refresh(line)
  return PoLineOut.from_orm(line).copy(update={
    "part": PartBrief.from_orm(part_obj or line.part) if (part_obj or line.part) else None,
    "rev": RevBrief.from_orm(rev_obj or line.rev) if (rev_obj or line.rev) else None,
  })


@router.delete("/{po_id}/lines/{line_id}")
def delete_po_line(po_id: int, line_id: int, db: Session = Depends(get_db)):
  po = db.get(PO, po_id)
  if not po: raise HTTPException(404, "PO not found")
  line = db.get(POLine, line_id)
  if not line or line.po_id != po_id:
    raise HTTPException(404, "Line not found")

  # ป้องกันถ้ามี Lot/Shipment อ้างถึงบรรทัดนี้อยู่ (คุณจะเพิ่มเช็คเองได้ภายหลัง)
  # if db.query(ProductionLot).filter(ProductionLot.po_line_id == line_id).first():
  #   raise HTTPException(400, "Line linked to lot; cannot delete")

  db.delete(line)
  db.commit()
  return {"message": "Line deleted"}



####################333


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

# ================== PO (Pydantic v2 clean) ==================
# routers/parts.py
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List
from pydantic import BaseModel, ConfigDict
from database import get_db
from models import Part, PartRevision
# -------- Schemas (Pydantic v2) --------
class PartOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    part_no: str
    name: str | None = None

class PartRevisionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    rev: str
    is_current: bool | None = None

# GET /parts?q=term&limit=20
@router.get("", response_model=List[PartOut])
def search_parts(
    q: str = Query(""),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db)
):
    term = (q or "").strip()
    qry = db.query(Part)
    if term:
        # ค้นทั้ง part_no และ name (exact/like)
        like = f"%{term}%"
        qry = qry.filter((Part.part_no.ilike(like)) | (Part.name.ilike(like)))
    rows = qry.order_by(Part.part_no.asc()).limit(limit).all()
    return [PartOut.model_validate(p, from_attributes=True) for p in rows]

# GET /parts/{id}/revisions
@router.get("/{part_id}/revisions", response_model=List[PartRevisionOut])
def list_part_revisions(part_id: int, db: Session = Depends(get_db)):
    part = db.get(Part, part_id)
    if not part:
        raise HTTPException(404, "Part not found")
    revs = (
        db.query(PartRevision)
          .filter(PartRevision.part_id == part_id)
          .order_by(PartRevision.is_current.desc(), PartRevision.rev.asc())
          .all()
    )
    return [PartRevisionOut.model_validate(r, from_attributes=True) for r in revs]