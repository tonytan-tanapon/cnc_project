# routers/suppliers.py
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from sqlalchemy import or_
from typing import List, Optional
from pydantic import BaseModel

from database import get_db
from models import Supplier
from schemas import SupplierCreate, SupplierUpdate, SupplierOut
from utils.code_generator import next_code

router = APIRouter(prefix="/suppliers", tags=["suppliers"])

# ---------- /next-code ----------
@router.get("/next-code")
def get_next_supplier_code(prefix: str = "S", width: int = 4, db: Session = Depends(get_db)):
    """
    Generate next supplier code (default S0001, S0002, ...).
    Pass ?prefix=SUP&width=3 if you prefer SUP001 style.
    """
    return {"next_code": next_code(db, Supplier, "code", prefix=prefix, width=width)}

# ---------- page (offset) ----------
class SupplierPage(BaseModel):
    items: List[SupplierOut]
    total: int
    page: int
    per_page: int
    pages: int

# ---------- mini (lookup) ----------
class SupplierMini(BaseModel):
    id: int
    code: str | None = None
    name: str | None = None
    class Config:
        orm_mode = True  # if pydantic v2: model_config = {"from_attributes": True}

# ---------- keyset (cursor) ----------
class SupplierCursorPage(BaseModel):
    items: List[SupplierOut]
    next_cursor: int | None = None
    prev_cursor: int | None = None
    has_more: bool

@router.get("", response_model=SupplierPage)
def list_suppliers(
    q: Optional[str] = Query(None, description="Search by code or name (ilike)"),
    page: int = Query(1, ge=1),
    per_page: Optional[int] = Query(20, ge=1, le=1000),
    all: bool = Query(False, description="Return all rows (ignore page/per_page)"),
    db: Session = Depends(get_db),
):
    base_q = db.query(Supplier)
    if q and q.strip():
        like = f"%{q.strip()}%"
        base_q = base_q.filter(or_(Supplier.code.ilike(like), Supplier.name.ilike(like)))

    base_q = base_q.order_by(Supplier.id.desc())

    if all:
        items = base_q.all()
        total = len(items)
        return {
            "items": items,
            "total": total,
            "page": 1,
            "per_page": total,
            "pages": 1,
        }

    total = base_q.count()
    limit = per_page or 20
    offset = (page - 1) * limit
    items = base_q.offset(offset).limit(limit).all()
    pages = (total + limit - 1) // limit

    return {
        "items": items,
        "total": total,
        "page": page,
        "per_page": limit,
        "pages": max(pages, 1),
    }

@router.get("/keyset", response_model=SupplierCursorPage)
def list_suppliers_keyset(
    q: Optional[str] = Query(None, description="Search by code or name (ILIKE)"),
    limit: int = Query(25, ge=1, le=200),
    cursor: Optional[int] = Query(None, description="fetch id < cursor (DESC)"),
    db: Session = Depends(get_db),
):
    qry = db.query(Supplier)
    if q and q.strip():
        like = f"%{q.strip()}%"
        qry = qry.filter(or_(Supplier.code.ilike(like), Supplier.name.ilike(like)))

    if cursor is not None:
        qry = qry.filter(Supplier.id < cursor)

    qry = qry.order_by(Supplier.id.desc())

    rows = qry.limit(limit + 1).all()
    page_rows = rows[:limit]
    has_more = len(rows) > limit

    # pydantic v2:
    items: List[SupplierOut] = [SupplierOut.model_validate(r) for r in page_rows]

    next_cursor = min((r.id for r in page_rows), default=None)
    prev_cursor = None

    return {
        "items": items,
        "next_cursor": next_cursor,
        "prev_cursor": prev_cursor,
        "has_more": has_more,
    }

# ---------- lookup (id list) ----------
@router.get("/lookup", response_model=List[SupplierMini])
def lookup_suppliers(ids: str, db: Session = Depends(get_db)):
    """
    ?ids=1,2,3 → return id, code, name (for dropdowns / mapping).
    """
    try:
        id_list = [int(x) for x in ids.split(",") if x.strip().isdigit()]
    except Exception:
        id_list = []
    if not id_list:
        return []
    rows = db.query(Supplier).filter(Supplier.id.in_(id_list)).all()
    return rows

# ---------- create (AUTO code supported) ----------
@router.post("", response_model=SupplierOut)
def create_supplier(payload: SupplierCreate, db: Session = Depends(get_db)):
    raw = (payload.code or "").strip().upper()
    autogen = raw in ("", "AUTO", "AUTOGEN")
    code = next_code(db, Supplier, "code", prefix="S", width=4) if autogen else raw

    if db.query(Supplier).filter(Supplier.code == code).first():
        raise HTTPException(409, "Supplier code already exists")

    s = Supplier(
        code=code,
        name=payload.name.strip(),
        contact=payload.contact,
        email=payload.email,
        phone=payload.phone,
        address=payload.address,
        payment_terms=payload.payment_terms,
    )

    for _ in range(3):
        try:
            db.add(s); db.commit(); db.refresh(s)
            return s
        except IntegrityError:
            db.rollback()
            if autogen:
                s.code = next_code(db, Supplier, "code", prefix="S", width=4)
            else:
                raise HTTPException(409, "Supplier code already exists")
    raise HTTPException(500, "Failed to generate unique supplier code")

@router.get("/{supplier_id}", response_model=SupplierOut)
def get_supplier(supplier_id: int, db: Session = Depends(get_db)):
    s = db.get(Supplier, supplier_id)
    if not s:
        raise HTTPException(404, "Supplier not found")
    return s

@router.patch("/{supplier_id}", response_model=SupplierOut)
def update_supplier(supplier_id: int, payload: SupplierUpdate, db: Session = Depends(get_db)):
    s = db.get(Supplier, supplier_id)
    if not s:
        raise HTTPException(404, "Supplier not found")

    # apply partial update
    for k, v in payload.dict(exclude_unset=True).items():
        # keep code uppercased if provided
        if k == "code" and v:
            setattr(s, k, (v or "").strip().upper())
        else:
            setattr(s, k, v)

    try:
        db.commit(); db.refresh(s)
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Duplicate or invalid data")
    return s

@router.delete("/{supplier_id}")
def delete_supplier(supplier_id: int, db: Session = Depends(get_db)):
    s = db.get(Supplier, supplier_id)
    if not s:
        raise HTTPException(404, "Supplier not found")
    # block if referenced by raw_batches
    if getattr(s, "raw_batches", None):
        if s.raw_batches:
            raise HTTPException(400, "Supplier in use (raw_batches); cannot delete")
    db.delete(s)
    db.commit()
    return {"message": "Supplier deleted"}
