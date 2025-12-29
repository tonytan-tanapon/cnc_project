from __future__ import annotations
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Body, Response
from pydantic import BaseModel, ConfigDict
from sqlalchemy import or_, desc
from sqlalchemy.orm import Session, selectinload
from sqlalchemy.exc import IntegrityError

from database import get_db
from models import Part, PartRevision
from utils.code_generator import next_code

parts_router = APIRouter(prefix="/parts", tags=["parts"])

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

# ---------------- Schemas (output) ----------------
class RevOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    part_id: int
    rev: str
    spec: Optional[str] = None
    drawing_file: Optional[str] = None
    is_current: bool

class PartOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    part_no: str
    name: Optional[str] = None
    uom: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    revisions: Optional[List[RevOut]] = None

# ---------- Mini / Cursor page models (สำหรับ autocomplete / hydrate) ----------
class PartMini(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    part_no: Optional[str] = None
    name: Optional[str] = None

class PartCursorPage(BaseModel):
    items: List[PartOut]
    next_cursor: Optional[int] = None   # ไปหน้าเก่ากว่า (id < cursor)
    prev_cursor: Optional[int] = None   # กลับมาหน้าใหม่กว่า (id > before)
    has_more: bool

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
        revs = getattr(p, 'revisions', None) or []
        obj.revisions = [RevOut.model_validate(r) for r in revs]
    return obj
from sqlalchemy import text
# ===================== list (OFFSET) =====================
@parts_router.get("/{part_id}/lots")
def get_lots_by_part(
    part_id: int,
    revision_id: int | None = None,
    db: Session = Depends(get_db),
):
    sql = """
    SELECT *
    FROM v_lot_summary
    WHERE part_id = :part_id
      AND (:revision_id IS NULL OR revision_id = :revision_id)
    ORDER BY created_at DESC NULLS LAST, lot_id DESC
    """

    rows = db.execute(
        text(sql),
        {
            "part_id": part_id,
            "revision_id": revision_id,
        },
    ).mappings().all()

    return {"items": [dict(r) for r in rows]}

# ===================== 🔹 NEW: lookup & bulk (ต้องวางเหนือ /{part_id}) =====================

@parts_router.get("/lookup", response_model=List[PartMini])
def lookup_parts(ids: str, db: Session = Depends(get_db)):
    """
    GET /parts/lookup?ids=1,2,3  ->  [{id, part_no, name}, ...]
    ใช้เติม label (hydrate) จาก id หลายตัวในครั้งเดียว
    """
    try:
        id_list = [int(x) for x in ids.split(",") if x.strip().isdigit()]
    except Exception:
        id_list = []
    if not id_list:
        return []
    rows = db.query(Part).filter(Part.id.in_(id_list)).all()
    return rows

class BulkRequest(BaseModel):
    ids: List[int]

@parts_router.post("/bulk", response_model=List[PartMini])
def bulk_parts(payload: BulkRequest = Body(...), db: Session = Depends(get_db)):
    """
    POST /parts/bulk
    Body: {"ids":[1,2,3]}  ->  [{id, part_no, name}, ...]
    ใช้กรณีจำนวน id เยอะจน query string ยาวเกิน หรืออยากใช้ POST batch
    """
    ids = payload.ids or []
    if not ids:
        return []
    rows = db.query(Part).filter(Part.id.in_(ids)).all()
    return rows

# ===================== 🔹 NEW: keyset (DESC: newest -> oldest) =====================


@parts_router.get("/keyset", response_model=PartCursorPage)
def list_parts_keyset(
    q: Optional[str] = Query(None, description="search part_no/name (ILIKE)"),
    limit: int = Query(25, ge=1, le=200),
    cursor: Optional[int] = Query(None, description="(DESC) next page: id < cursor"),
    before: Optional[int] = Query(None, description="(DESC) prev page: id > before"),
    include: Optional[str] = Query(None, description="e.g. 'revisions'"),
    db: Session = Depends(get_db),
):
    qry = db.query(Part)

    if q and q.strip():
        like = f"%{q.strip()}%"
        qry = qry.filter(or_(Part.part_no.ilike(like), Part.name.ilike(like)))

    include_revs = (include == "revisions")
    if include_revs:
        qry = qry.options(selectinload(Part.revisions))

    # เคลื่อนแบบ keyset: DESC ใหม่ -> เก่า
    going_prev = before is not None and cursor is None
    if going_prev:
        # กลับไปหน้าใหม่กว่า: id > before, sort ASC แล้วค่อย reverse ให้เป็น DESC
        qry = qry.filter(Part.id > before).order_by(Part.id.asc())
        rows = qry.limit(limit + 1).all()
        rows = list(reversed(rows))
    else:
        # หน้าแรก หรือไปหน้าเก่ากว่า: id < cursor
        if cursor is not None:
            qry = qry.filter(Part.id < cursor)
        qry = qry.order_by(desc(Part.id))
        rows = qry.limit(limit + 1).all()

    page_rows = rows[:limit]
    has_more = len(rows) > limit

    items = [to_part_out(p, include_revs=include_revs) for p in page_rows]
    next_cursor = page_rows[-1].id if page_rows else None
    prev_cursor = page_rows[0].id if page_rows else None

    return {
        "items": items,
        "next_cursor": next_cursor,
        "prev_cursor": prev_cursor,
        "has_more": has_more,
    }

@parts_router.get("/", response_model=dict)
def list_parts(
    db: Session = Depends(get_db),
    q: str | None = Query(None, description="search in part_no or name"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=1000),
):
    query = db.query(Part).options(selectinload(Part.revisions))
    if q:
        like = f"%{q}%"
        query = query.filter(or_(Part.part_no.ilike(like), Part.name.ilike(like)))

    query = query.order_by(Part.part_no.asc())
    items = query.offset((page - 1) * page_size).limit(page_size).all()

    # ใส่ current_rev ให้พร้อมใช้ (ถ้าอยากส่งมาใน payload)
    def to_dict(p: Part):
        cur_rev = ""
        if p.revisions:
            cur = next((r for r in p.revisions if getattr(r, "is_current", False)), None)
            cur_rev = cur.rev if cur else ""
        return {
            "id": p.id,
            "part_no": p.part_no,
            "name": p.name,
            "default_uom": p.default_uom,
            "status": p.status,
            "current_rev": cur_rev,
            # "revisions": [{"id": r.id, "rev": r.rev, "is_current": r.is_current} for r in p.revisions],
        }

    return {"items": [to_dict(p) for p in items]}
# @parts_router.get("/", response_model=dict)
# def list_parts(
#     q: Optional[str] = Query(default=None, description="search part_no/name"),
#     page: int = 1,
#     page_size: int = 100,
#     include: Optional[str] = Query(default=None, description="e.g. 'revisions'"),
#     db: Session = Depends(get_db),
# ):
#     query = db.query(Part)

#     if q:
#         like = f"%{q}%"
#         query = query.filter(or_(Part.part_no.ilike(like), Part.name.ilike(like)))

#     include_revs = (include == "revisions")
#     if include_revs:
#         query = query.options(selectinload(Part.revisions))  # ลด N+1

#     total = query.count()
#     items = (
#         query.order_by(Part.part_no)
#         .offset((page - 1) * page_size)
#         .limit(page_size)
#         .all()
#     )
#     data = [to_part_out(p, include_revs=include_revs) for p in items]
#     return {"items": data, "total": total, "page": page, "page_size": page_size}

# ===================== CRUD =====================

@parts_router.post("/", response_model=PartOut, status_code=201)
def create_part(payload: PartCreate, db: Session = Depends(get_db)):
    raw = (payload.part_no or "").strip().upper()
    autogen = raw in ("", "AUTO", "AUTOGEN")
    code = next_code(db, Part, "part_no", prefix="P", width=5) if autogen else raw

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
                p.part_no = next_code(db, Part, "part_no", prefix="P", width=5)
            else:
                raise HTTPException(409, "Duplicate part_no")
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

    if r.is_current:
        db.query(PartRevision)\
          .filter(PartRevision.part_id == r.part_id, PartRevision.id != r.id, PartRevision.is_current == True)\
          .update({PartRevision.is_current: False}, synchronize_session=False)
        db.commit()
        db.refresh(r)

    return RevOut.model_validate(r)

@parts_router.delete("/revisions/{rev_id}", status_code=204)
def delete_revision(rev_id: int, db: Session = Depends(get_db)):
    r = db.get(PartRevision, rev_id)
    if not r:
        raise HTTPException(404, "Revision not found")

    db.delete(r)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Revision is in use and cannot be deleted")
    return Response(status_code=204)

@parts_router.get("/revisions", response_model=List[RevOut])
def list_revisions_qs(part_id: int, db: Session = Depends(get_db)):
    return list_revisions(part_id, db)

@parts_router.get("/part-revisions", response_model=List[RevOut])
def list_revisions_dash(part_id: int, db: Session = Depends(get_db)):
    return list_revisions(part_id, db)
