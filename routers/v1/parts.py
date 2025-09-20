from __future__ import annotations
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict
from sqlalchemy import or_
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from database import get_db
from models import Part, PartRevision

parts_router = APIRouter(prefix="/parts", tags=["parts"])

from utils.code_generator import next_code

@parts_router.get("/next-code")
def get_next_part_code(prefix: str = "P", width: int = 5, db: Session = Depends(get_db)):
    return {"next_code": next_code(db, Part, "part_no", prefix=prefix, width=width)}

# ---------------- Schemas (API ใช้ชื่อ uom/description/status) ----------------
class PartCreate(BaseModel):
    part_no: str | None = None          # ⬅️ allow autogen
    name: Optional[str] = None
    uom: Optional[str] = None           # -> model.default_uom
    description: str = ""               # -> model.description
    status: Optional[str] = "active"    # -> model.status

class PartUpdate(BaseModel):
    part_no: Optional[str] = None
    name: Optional[str] = None
    uom: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
from sqlalchemy.orm import Session, selectinload  # ⬅ เพิ่ม selectinload
# ---------------- Schemas ----------------
class PartOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    part_no: str
    name: Optional[str] = None
    uom: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    # ⬇⬇ เพิ่มฟิลด์นี้เพื่อแนบ revisions ออกไปได้
    revisions: Optional[List['RevOut']] = None  # ใช้ __future__ แล้ว รองรับ forward ref

# ----- Revisions Schemas (ใช้ spec/drawing_file/is_current) -----
class RevCreate(BaseModel):
    rev: str
    spec: Optional[str] = ""
    drawing_file: Optional[str] = None
    is_current: bool = False

class RevUpdate(BaseModel):
    rev: Optional[str] = None
    spec: Optional[str] = None
    drawing_file: Optional[str] = None
    is_current: Optional[bool] = None

class RevOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    part_id: int
    rev: str
    spec: Optional[str] = None
    drawing_file: Optional[str] = None
    is_current: bool


# ---------------- Helper: map Part -> PartOut dict ----------------
def to_part_out(p: Part, include_revs: bool = False) -> PartOut:
    obj = PartOut(
        id=p.id,
        part_no=p.part_no,
        name=p.name,
        uom=p.default_uom,
        description=p.description,
        status=p.status,
    )
    if include_revs:
        # ป้องกันกรณีความสัมพันธ์ยังไม่โหลด
        revs = getattr(p, 'revisions', None) or []
        obj.revisions = [RevOut.model_validate(r) for r in revs]
    return obj


# ---------------- Endpoints ----------------
@parts_router.get("/", response_model=dict)
def list_parts(
    q: Optional[str] = Query(default=None, description="search part_no/name"),
    page: int = 1,
    page_size: int = 100,
    include: Optional[str] = Query(default=None, description="e.g. 'revisions'"),
    db: Session = Depends(get_db),
):
    query = db.query(Part)

    if q:
        like = f"%{q}%"
        query = query.filter(or_(Part.part_no.ilike(like), Part.name.ilike(like)))

    include_revs = (include == "revisions")
    if include_revs:
        query = query.options(selectinload(Part.revisions))  # ลด N+1

    total = query.count()
    items = (
        query.order_by(Part.part_no)
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    data = [to_part_out(p, include_revs=include_revs) for p in items]
    return {"items": data, "total": total, "page": page, "page_size": page_size}

from sqlalchemy.exc import IntegrityError

@parts_router.post("/", response_model=PartOut, status_code=201)
def create_part(payload: PartCreate, db: Session = Depends(get_db)):
    raw = (payload.part_no or "").strip().upper()
    autogen = raw in ("", "AUTO", "AUTOGEN")

    # choose your default format here
    code = next_code(db, Part, "part_no", prefix="P", width=5) if autogen else raw

    # quick existence check (nice error if client supplied duplicate)
    if not autogen and db.query(Part).filter(Part.part_no == code).first():
        raise HTTPException(409, "Duplicate part_no")

    p = Part(
        part_no=code,
        name=payload.name,
        description=payload.description,
        default_uom=payload.uom or "ea",
        status=payload.status or "active",
    )

    for _ in range(3):
        try:
            db.add(p)
            db.commit()
            db.refresh(p)
            return to_part_out(p)
        except IntegrityError:
            db.rollback()
            if autogen:
                # regenerate and try again
                p.part_no = next_code(db, Part, "part_no", prefix="P", width=5)
            else:
                # user-supplied duplicate
                raise HTTPException(409, "Duplicate part_no")

    # if we somehow failed 3 times
    raise HTTPException(500, "Failed to generate unique part_no")

@parts_router.get("/{part_id}", response_model=PartOut)
def get_part(part_id: int, db: Session = Depends(get_db)):
    p = db.query(Part).get(part_id)
    if not p:
        raise HTTPException(404, "Part not found")
    return to_part_out(p)

@parts_router.patch("/{part_id}", response_model=PartOut)
def update_part(part_id: int, payload: PartUpdate, db: Session = Depends(get_db)):
    p = db.query(Part).get(part_id)
    if not p:
        raise HTTPException(404, "Part not found")

    if payload.part_no is not None:
        p.part_no = payload.part_no
    if payload.name is not None:
        p.name = payload.name
    if payload.description is not None:
        p.description = payload.description
    if payload.uom is not None:
        p.default_uom = payload.uom
    if payload.status is not None:
        p.status = payload.status

    db.commit()
    db.refresh(p)
    return to_part_out(p)

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
    if not db.query(Part).get(part_id):
        raise HTTPException(404, "Part not found")
    rows = (
        db.query(PartRevision)
        .filter(PartRevision.part_id == part_id)
        .order_by(PartRevision.rev)
        .all()
    )
    return [RevOut.model_validate(r) for r in rows]

@parts_router.post("/{part_id}/revisions", response_model=RevOut, status_code=201)
def create_revision(part_id: int, payload: RevCreate, db: Session = Depends(get_db)):
    if not db.query(Part).get(part_id):
        raise HTTPException(404, "Part not found")

    r = PartRevision(
        part_id=part_id,
        rev=payload.rev,
        spec=payload.spec or None,
        drawing_file=payload.drawing_file or None,
        is_current=bool(payload.is_current),
    )
    db.add(r)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Duplicate revision for this part")
    db.refresh(r)

    # ถ้าตั้ง is_current=True ให้ปิด current ตัวอื่น
    if r.is_current:
        db.query(PartRevision)\
          .filter(PartRevision.part_id == part_id, PartRevision.id != r.id, PartRevision.is_current == True)\
          .update({PartRevision.is_current: False}, synchronize_session=False)
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
    if payload.spec is not None:
        r.spec = payload.spec
    if payload.drawing_file is not None:
        r.drawing_file = payload.drawing_file
    if payload.is_current is not None:
        r.is_current = bool(payload.is_current)

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Duplicate revision for this part")
    db.refresh(r)

    # ถ้าเพิ่งตั้ง current ให้เคลียร์ตัวอื่น
    if r.is_current:
        db.query(PartRevision)\
          .filter(PartRevision.part_id == r.part_id, PartRevision.id != r.id, PartRevision.is_current == True)\
          .update({PartRevision.is_current: False}, synchronize_session=False)
        db.commit()
        db.refresh(r)

    return RevOut.model_validate(r)
from fastapi import APIRouter, Depends, HTTPException, Response
@parts_router.delete("/revisions/{rev_id}", status_code=204)
def delete_revision(rev_id: int, db: Session = Depends(get_db)):
    # ✅ ใช้ Session.get ใน SQLAlchemy 2.x
    r = db.get(PartRevision, rev_id)
    if not r:
        raise HTTPException(404, "Revision not found")

    db.delete(r)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Revision is in use and cannot be deleted")

    # ✅ 204: no content
    return Response(status_code=204)

@parts_router.get("/revisions", response_model=List[RevOut])
def list_revisions_qs(part_id: int, db: Session = Depends(get_db)):
    return list_revisions(part_id, db)

@parts_router.get("/part-revisions", response_model=List[RevOut])
def list_revisions_dash(part_id: int, db: Session = Depends(get_db)):
    return list_revisions(part_id, db)