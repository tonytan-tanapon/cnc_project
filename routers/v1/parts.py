from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, ConfigDict
from sqlalchemy import or_
from sqlalchemy.orm import Session

from database import get_db
from models import Part, PartRevision

# export ชื่อตามที่ __init__.py ใช้
parts_router = APIRouter(prefix="/parts", tags=["parts"])

# ---------- Schemas ----------
class PartCreate(BaseModel):
    part_no: str
    name: Optional[str] = None
    uom: Optional[str] = None
    note: str = ""

class PartUpdate(BaseModel):
    part_no: Optional[str] = None
    name: Optional[str] = None
    uom: Optional[str] = None
    note: Optional[str] = None

class PartOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    part_no: str
    name: Optional[str] = None
    uom: Optional[str] = None
    note: Optional[str] = None

class RevCreate(BaseModel):
    rev: str
    description: str = ""

class RevUpdate(BaseModel):
    rev: Optional[str] = None
    description: Optional[str] = None

class RevOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    part_id: int
    rev: str
    description: Optional[str] = None

# ---------- Part endpoints ----------
@parts_router.get("/", response_model=dict)
def list_parts(
    q: Optional[str] = Query(default=None, description="search part_no/name"),
    page: int = 1,
    page_size: int = 20,
    db: Session = Depends(get_db),
):
    query = db.query(Part)
    if q:
        like = f"%{q}%"
        query = query.filter(or_(Part.part_no.ilike(like), Part.name.ilike(like)))
    total = query.count()
    items = (
        query.order_by(Part.part_no)
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    data = [PartOut.model_validate(p) for p in items]
    return {"items": data, "total": total, "page": page, "page_size": page_size}

@parts_router.post("/", response_model=PartOut, status_code=201)
def create_part(payload: PartCreate, db: Session = Depends(get_db)):
    p = Part(part_no=payload.part_no, name=payload.name, uom=payload.uom, note=payload.note)
    db.add(p)
    db.commit()
    db.refresh(p)
    return PartOut.model_validate(p)

@parts_router.get("/{part_id}", response_model=PartOut)
def get_part(part_id: int, db: Session = Depends(get_db)):
    p = db.query(Part).get(part_id)
    if not p:
        raise HTTPException(404, "Part not found")
    return PartOut.model_validate(p)

@parts_router.patch("/{part_id}", response_model=PartOut)
def update_part(part_id: int, payload: PartUpdate, db: Session = Depends(get_db)):
    p = db.query(Part).get(part_id)
    if not p:
        raise HTTPException(404, "Part not found")

    if payload.part_no is not None:
        p.part_no = payload.part_no
    if payload.name is not None:
        p.name = payload.name
    if payload.uom is not None:
        p.uom = payload.uom
    if payload.note is not None:
        p.note = payload.note

    db.commit()
    db.refresh(p)
    return PartOut.model_validate(p)

@parts_router.delete("/{part_id}", status_code=204)
def delete_part(part_id: int, db: Session = Depends(get_db)):
    p = db.query(Part).get(part_id)
    if not p:
        raise HTTPException(404, "Part not found")
    db.delete(p)
    db.commit()
    return None

# ---------- Revisions ----------
@parts_router.get("/{part_id}/revisions", response_model=List[RevOut])
def list_revisions(part_id: int, db: Session = Depends(get_db)):
    rows = (
        db.query(PartRevision)
        .filter(PartRevision.part_id == part_id)
        .order_by(PartRevision.rev)
        .all()
    )
    return [RevOut.model_validate(r) for r in rows]

@parts_router.post("/{part_id}/revisions", response_model=RevOut, status_code=201)
def create_revision(part_id: int, payload: RevCreate, db: Session = Depends(get_db)):
    p = db.query(Part).get(part_id)
    if not p:
        raise HTTPException(404, "Part not found")
    r = PartRevision(part_id=part_id, rev=payload.rev, description=payload.description)
    db.add(r)
    db.commit()
    db.refresh(r)
    return RevOut.model_validate(r)

@parts_router.patch("/revisions/{rev_id}", response_model=RevOut)
def update_revision(rev_id: int, payload: RevUpdate, db: Session = Depends(get_db)):
    r = db.query(PartRevision).get(rev_id)
    if not r:
        raise HTTPException(404, "Revision not found")
    if payload.rev is not None:
        r.rev = payload.rev
    if payload.description is not None:
        r.description = payload.description
    db.commit()
    db.refresh(r)
    return RevOut.model_validate(r)

@parts_router.delete("/revisions/{rev_id}", status_code=204)
def delete_revision(rev_id: int, db: Session = Depends(get_db)):
    r = db.query(PartRevision).get(rev_id)
    if not r:
        raise HTTPException(404, "Revision not found")
    db.delete(r)
    db.commit()
    return None
