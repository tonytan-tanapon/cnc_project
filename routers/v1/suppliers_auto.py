from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi_crudrouter import SQLAlchemyCRUDRouter
from sqlalchemy.orm import Session
from sqlalchemy import or_
from sqlalchemy.exc import IntegrityError
from typing import List, Optional

from database import get_db
from models import Supplier
from schemas import SupplierCreate, SupplierUpdate, SupplierOut
from utils.code_generator import next_code

router = APIRouter(prefix="/suppliers", tags=["suppliers"])

# ----------------------------------------
# CRUD Router
# ----------------------------------------
crud_router = SQLAlchemyCRUDRouter(
    schema=SupplierOut,
    create_schema=SupplierCreate,
    update_schema=SupplierUpdate,
    db_model=Supplier,
    db=get_db,
    tags=["suppliers"],
)
router.include_router(crud_router)


# ✅ เพิ่ม PUT เพื่อรองรับ dynamic-table.js
@router.put("/{item_id}", response_model=SupplierOut)
def update_supplier_full(
    item_id: int,
    payload: SupplierUpdate,
    db: Session = Depends(get_db),
):
    row = db.query(Supplier).filter(Supplier.id == item_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Supplier not found")

    for key, value in payload.dict(exclude_unset=True).items():
        setattr(row, key, value)

    try:
        db.commit()
        db.refresh(row)
        return row
    except IntegrityError as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))


# ---------- /next-code ----------
@router.get("/next-code")
def get_next_supplier_code(
    prefix: str = Query("S", description="Prefix for supplier code"),
    width: int = Query(4, description="Zero-padding width"),
    db: Session = Depends(get_db),
):
    return {"next_code": next_code(db, Supplier, "code", prefix=prefix, width=width)}


# ---------- /lookup ----------
@router.get("/lookup", response_model=List[SupplierOut])
def lookup_suppliers(ids: str, db: Session = Depends(get_db)):
    id_list = [int(x) for x in ids.split(",") if x.strip().isdigit()]
    if not id_list:
        return []
    return db.query(Supplier).filter(Supplier.id.in_(id_list)).all()


# ---------- /search ----------
@router.get("/search", response_model=List[SupplierOut])
def search_suppliers(
    q: Optional[str] = Query(None),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    if not q or not q.strip():
        return []
    like = f"%{q.strip()}%"
    rows = (
        db.query(Supplier)
        .filter(or_(Supplier.code.ilike(like), Supplier.name.ilike(like)))
        .order_by(Supplier.name.asc())
        .limit(limit)
        .all()
    )
    return rows


# ---------- /page ----------
@router.get("/page")
def list_suppliers_page(
    q: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=200),
    db: Session = Depends(get_db),
):
    base_q = db.query(Supplier)
    if q and q.strip():
        like = f"%{q.strip()}%"
        base_q = base_q.filter(or_(Supplier.code.ilike(like), Supplier.name.ilike(like)))

    total = base_q.count()
    items = (
        base_q.order_by(Supplier.id.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
        .all()
    )
    pages = (total + per_page - 1) // per_page
    return {"items": items, "total": total, "page": page, "per_page": per_page, "pages": pages}


# ---------- /keyset ----------
@router.get("/keyset")
def list_suppliers_keyset(
    q: Optional[str] = Query(None),
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

    items = rows[:limit]
    has_more = len(rows) > limit
    next_cursor = min((r.id for r in items), default=None)

    return {"items": items, "next_cursor": next_cursor, "has_more": has_more}
