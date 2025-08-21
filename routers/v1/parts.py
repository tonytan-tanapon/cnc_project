# routers/parts.py
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from typing import List, Optional
from pydantic import BaseModel

from database import get_db
from models import Part, PartRevision

# =========================
# Pydantic Schemas (inline)
# =========================
class PartCreate(BaseModel):
    part_no: str
    name: Optional[str] = None
    description: Optional[str] = None
    default_uom: Optional[str] = "ea"
    status: Optional[str] = "active"

class PartUpdate(BaseModel):
    part_no: Optional[str] = None
    name: Optional[str] = None
    description: Optional[str] = None
    default_uom: Optional[str] = None
    status: Optional[str] = None

class PartOut(BaseModel):
    id: int
    part_no: str
    name: Optional[str] = None
    description: Optional[str] = None
    default_uom: Optional[str] = None
    status: Optional[str] = None

    class Config:
        from_attributes = True

class PartRevisionCreate(BaseModel):
    part_id: int
    rev: str
    drawing_file: Optional[str] = None
    spec: Optional[str] = None
    is_current: Optional[bool] = False

class PartRevisionUpdate(BaseModel):
    rev: Optional[str] = None
    drawing_file: Optional[str] = None
    spec: Optional[str] = None
    is_current: Optional[bool] = None

class PartRevisionOut(BaseModel):
    id: int
    part_id: int
    rev: str
    drawing_file: Optional[str] = None
    spec: Optional[str] = None
    is_current: bool

    class Config:
        from_attributes = True

# =========================
# Routers
# =========================
parts_router = APIRouter(prefix="/parts", tags=["parts"])
part_revisions_router = APIRouter(prefix="/part-revisions", tags=["part-revisions"])

# ==========
# /parts
# ==========
@parts_router.get("", response_model=List[PartOut])
def list_parts(
    q: Optional[str] = Query(None, description="ค้นหาใน part_no / name / description"),
    db: Session = Depends(get_db),
):
    query = db.query(Part)
    if q:
        ql = f"%{q}%"
        query = query.filter(
            (Part.part_no.ilike(ql)) |
            (Part.name.ilike(ql)) |
            (Part.description.ilike(ql))
        )
    return query.order_by(Part.id.desc()).all()

@parts_router.post("", response_model=PartOut)
def create_part(payload: PartCreate, db: Session = Depends(get_db)):
    part_no = (payload.part_no or "").strip().upper()
    if not part_no:
        raise HTTPException(400, "part_no is required")

    if db.query(Part).filter(Part.part_no == part_no).first():
        raise HTTPException(409, "part_no already exists")

    p = Part(
        part_no=part_no,
        name=(payload.name or None),
        description=(payload.description or None),
        default_uom=(payload.default_uom or "ea"),
        status=(payload.status or "active"),
    )
    db.add(p)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "part_no already exists")
    db.refresh(p)
    return p

@parts_router.get("/{part_id}", response_model=PartOut)
def get_part(part_id: int, db: Session = Depends(get_db)):
    p = db.get(Part, part_id)
    if not p:
        raise HTTPException(404, "Part not found")
    return p

@parts_router.put("/{part_id}", response_model=PartOut)
def update_part(part_id: int, payload: PartUpdate, db: Session = Depends(get_db)):
    p = db.get(Part, part_id)
    if not p:
        raise HTTPException(404, "Part not found")

    data = payload.model_dump(exclude_unset=True)

    # เปลี่ยน part_no ต้องไม่ซ้ำ
    if "part_no" in data and data["part_no"]:
        new_no = (data["part_no"] or "").strip().upper()
        if new_no != p.part_no:
            dup = db.query(Part).filter(Part.part_no == new_no, Part.id != part_id).first()
            if dup:
                raise HTTPException(409, "part_no already exists")
            p.part_no = new_no
        del data["part_no"]

    for k, v in data.items():
        setattr(p, k, v)

    db.commit()
    db.refresh(p)
    return p

@parts_router.delete("/{part_id}")
def delete_part(part_id: int, db: Session = Depends(get_db)):
    p = db.get(Part, part_id)
    if not p:
        raise HTTPException(404, "Part not found")
    # หมายเหตุ: Part.revisions มี cascade="all, delete-orphan" แล้ว
    db.delete(p)
    db.commit()
    return {"message": "Part deleted"}

# =====================
# /part-revisions
# =====================
@part_revisions_router.get("", response_model=List[PartRevisionOut])
def list_part_revisions(
    part_id: Optional[int] = Query(None, description="กรองตาม part_id"),
    db: Session = Depends(get_db),
):
    query = db.query(PartRevision)
    if part_id:
        query = query.filter(PartRevision.part_id == part_id)
    return query.order_by(PartRevision.part_id.asc(), PartRevision.id.desc()).all()

@part_revisions_router.post("", response_model=PartRevisionOut)
def create_part_revision(payload: PartRevisionCreate, db: Session = Depends(get_db)):
    # part ต้องมีอยู่จริง
    part = db.get(Part, payload.part_id)
    if not part:
        raise HTTPException(400, "part_id not found")

    rev = (payload.rev or "").strip().upper()
    if not rev:
        raise HTTPException(400, "rev is required")

    # ห้ามซ้ำในคู่ (part_id, rev)
    dup = (
        db.query(PartRevision)
        .filter(PartRevision.part_id == payload.part_id, PartRevision.rev == rev)
        .first()
    )
    if dup:
        raise HTTPException(409, "rev already exists for this part")

    r = PartRevision(
        part_id=payload.part_id,
        rev=rev,
        drawing_file=(payload.drawing_file or None),
        spec=(payload.spec or None),
        is_current=bool(payload.is_current),
    )
    db.add(r)

    # ถ้า set is_current=True ให้ยกเลิก current ตัวอื่นของ part เดียวกัน
    if r.is_current:
        db.query(PartRevision).filter(
            PartRevision.part_id == r.part_id,
            PartRevision.id != r.id
        ).update({"is_current": False}, synchronize_session=False)

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Unique constraint failed (part_id, rev)")
    db.refresh(r)
    return r

@part_revisions_router.get("/{rev_id}", response_model=PartRevisionOut)
def get_part_revision(rev_id: int, db: Session = Depends(get_db)):
    r = db.get(PartRevision, rev_id)
    if not r:
        raise HTTPException(404, "Revision not found")
    return r

@part_revisions_router.put("/{rev_id}", response_model=PartRevisionOut)
def update_part_revision(rev_id: int, payload: PartRevisionUpdate, db: Session = Depends(get_db)):
    r = db.get(PartRevision, rev_id)
    if not r:
        raise HTTPException(404, "Revision not found")

    data = payload.model_dump(exclude_unset=True)

    # เปลี่ยน rev ต้องไม่ชนใน part เดิม
    if "rev" in data and data["rev"]:
        new_rev = (data["rev"] or "").strip().upper()
        if new_rev != r.rev:
            dup = (
                db.query(PartRevision)
                .filter(
                    PartRevision.part_id == r.part_id,
                    PartRevision.rev == new_rev,
                    PartRevision.id != r.id,
                )
                .first()
            )
            if dup:
                raise HTTPException(409, "rev already exists for this part")
            r.rev = new_rev
        del data["rev"]

    # อัปเดตฟิลด์อื่น
    for k, v in data.items():
        setattr(r, k, v)

    db.flush()

    # ถ้าตั้ง current=True ให้ตัวอื่นของ part เดียวกันเป็น False
    if payload.is_current is True:
        db.query(PartRevision).filter(
            PartRevision.part_id == r.part_id,
            PartRevision.id != r.id
        ).update({"is_current": False}, synchronize_session=False)

    db.commit()
    db.refresh(r)
    return r

@part_revisions_router.delete("/{rev_id}")
def delete_part_revision(rev_id: int, db: Session = Depends(get_db)):
    r = db.get(PartRevision, rev_id)
    if not r:
        raise HTTPException(404, "Revision not found")
    db.delete(r)
    db.commit()
    return {"message": "Revision deleted"}
