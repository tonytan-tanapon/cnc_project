# routers/materials.py
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from sqlalchemy import or_
from typing import List, Optional
from pydantic import BaseModel

from database import get_db
from models import RawMaterial
from schemas import RawMaterialCreate, RawMaterialUpdate, RawMaterialOut
from utils.code_generator import next_code  # same util you used for customers

router = APIRouter(prefix="/materials", tags=["materials"])

# ---------- next-code (optional, for AUTOGEN in UI) ----------
@router.get("/next-code")
def get_next_material_code(prefix: str = "M", width: int = 4, db: Session = Depends(get_db)):
    return {"next_code": next_code(db, RawMaterial, "code", prefix=prefix, width=width)}

# ---------- Page (offset) ----------
class MaterialPage(BaseModel):
    items: List[RawMaterialOut]
    total: int
    page: int
    per_page: int
    pages: int

# ---------- Mini for lookup ----------
class MaterialMini(BaseModel):
    id: int
    code: Optional[str] = None
    name: Optional[str] = None
    class Config:
        from_attributes = True  # Pydantic v2

# ---------- Cursor page (keyset DESC: new -> old) ----------
class MaterialCursorPage(BaseModel):
    items: List[RawMaterialOut]
    next_cursor: Optional[int] = None   # go older
    prev_cursor: Optional[int] = None   # go newer
    has_more: bool


# --- add near the top ---
from pydantic import BaseModel
from typing import List

class MaterialMini(BaseModel):
    id: int
    code: str | None = None
    name: str | None = None
    # pydantic v2:
    model_config = {"from_attributes": True}
    # if v1:
    # class Config: orm_mode = True

# --- add this route (place it ABOVE "/{mat_id}" route) ---
@router.get("/lookup", response_model=List[MaterialMini])
def lookup_materials(ids: str, db: Session = Depends(get_db)):
    """
    ?ids=1,2,3  ->  [{id, code, name}, ...]
    """
    try:
        id_list = [int(x) for x in ids.split(",") if x.strip().isdigit()]
    except Exception:
        id_list = []
    if not id_list:
        return []
    rows = db.query(RawMaterial).filter(RawMaterial.id.in_(id_list)).all()
    return rows
# ---------- list (OFFSET) ----------
@router.get("", response_model=MaterialPage)
def list_materials(
    q: Optional[str] = Query(None, description="Search by code/name/spec (ILIKE)"),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    qry = db.query(RawMaterial)
    if q and q.strip():
        like = f"%{q.strip()}%"
        qry = qry.filter(or_(
            RawMaterial.code.ilike(like),
            RawMaterial.name.ilike(like),
            RawMaterial.spec.ilike(like),
        ))
    total = qry.count()
    qry = qry.order_by(RawMaterial.id.desc())
    offset = (page - 1) * per_page
    items = qry.offset(offset).limit(per_page).all()
    pages = (total + per_page - 1) // per_page if per_page else 1
    return {
        "items": items,
        "total": total,
        "page": page,
        "per_page": per_page,
        "pages": max(pages, 1),
    }

# ---------- list (KEYSET /cursor DESC: show newest -> oldest) ----------
@router.get("/keyset", response_model=MaterialCursorPage)
def list_materials_keyset(
    q: Optional[str] = Query(None, description="Search by code/name/spec (ILIKE)"),
    limit: int = Query(25, ge=1, le=200),
    cursor: Optional[int] = Query(None, description="(DESC) Next page (older): fetch id < cursor"),
    before: Optional[int] = Query(None, description="(DESC) Prev page (newer): fetch id > before"),
    db: Session = Depends(get_db),
):
    qry = db.query(RawMaterial)
    if q and q.strip():
        like = f"%{q.strip()}%"
        qry = qry.filter(or_(
            RawMaterial.code.ilike(like),
            RawMaterial.name.ilike(like),
            RawMaterial.spec.ilike(like),
        ))

    going_prev = before is not None and cursor is None
    if going_prev:
        # go to newer page: id > before, order ASC, then reverse to DESC
        qry = qry.filter(RawMaterial.id > before).order_by(RawMaterial.id.asc())
        rows = qry.limit(limit + 1).all()
        rows = list(reversed(rows))
    else:
        # first page or go older: id < cursor, order DESC
        if cursor is not None:
            qry = qry.filter(RawMaterial.id < cursor)
        qry = qry.order_by(RawMaterial.id.desc())
        rows = qry.limit(limit + 1).all()

    page_rows = rows[:limit]
    has_more = len(rows) > limit

    items: List[RawMaterialOut] = [RawMaterialOut.model_validate(r) for r in page_rows]
    next_cursor = page_rows[-1].id if page_rows else None  # older
    prev_cursor = page_rows[0].id if page_rows else None   # newer

    return {
        "items": items,
        "next_cursor": next_cursor,
        "prev_cursor": prev_cursor,
        "has_more": has_more,
    }

# ---------- lookup (id list) ----------
@router.get("/lookup", response_model=List[MaterialMini])
def lookup_materials(ids: str, db: Session = Depends(get_db)):
    """
    Accepts comma-separated ids, e.g. ?ids=1,2,3
    Returns minimal fields for mapping on other pages.
    """
    try:
        id_list = [int(x) for x in ids.split(",") if x.strip().isdigit()]
    except Exception:
        id_list = []
    if not id_list:
        return []
    rows = db.query(RawMaterial).filter(RawMaterial.id.in_(id_list)).all()
    return rows

# ---------- create (supports AUTO/AUTOGEN for code) ----------
@router.post("", response_model=RawMaterialOut)
def create_material(payload: RawMaterialCreate, db: Session = Depends(get_db)):
    raw_code = (payload.code or "").strip().upper()
    autogen = raw_code in ("", "AUTO", "AUTOGEN")
    code = next_code(db, RawMaterial, "code", prefix="M", width=4) if autogen else raw_code

    if db.query(RawMaterial).filter(RawMaterial.code == code).first():
        raise HTTPException(409, "Material code already exists")

    m = RawMaterial(
        code=code,
        name=payload.name.strip(),
        spec=payload.spec,
        uom=payload.uom,
        remark=payload.remark,
    )
    # retry a few times if AUTOGEN collides
    for _ in range(3):
        try:
            db.add(m); db.commit(); db.refresh(m)
            return m
        except IntegrityError:
            db.rollback()
            if autogen:
                m.code = next_code(db, RawMaterial, "code", prefix="M", width=4)
            else:
                raise HTTPException(409, "Material code already exists")
    raise HTTPException(500, "Failed to generate unique material code")

# ---------- get/update/delete ----------
@router.get("/{mat_id}", response_model=RawMaterialOut)
def get_material(mat_id: int, db: Session = Depends(get_db)):
    m = db.get(RawMaterial, mat_id)
    if not m:
        raise HTTPException(404, "Material not found")
    return m

@router.put("/{mat_id}", response_model=RawMaterialOut)
def update_material(mat_id: int, payload: RawMaterialUpdate, db: Session = Depends(get_db)):
    m = db.get(RawMaterial, mat_id)
    if not m:
        raise HTTPException(404, "Material not found")
    for k, v in payload.dict(exclude_unset=True).items():
        setattr(m, k, v)
    db.commit(); db.refresh(m)
    return m

@router.delete("/{mat_id}")
def delete_material(mat_id: int, db: Session = Depends(get_db)):
    m = db.get(RawMaterial, mat_id)
    if not m:
        raise HTTPException(404, "Material not found")
    # block delete if batches exist
    if getattr(m, "batches", None):
        # m.batches relationship must be configured on the model
        if m.batches:
            raise HTTPException(400, "Material has batches; cannot delete")
    db.delete(m); db.commit()
    return {"message": "Material deleted"}
