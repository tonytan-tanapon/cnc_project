from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi_crudrouter import SQLAlchemyCRUDRouter
from sqlalchemy.orm import Session
from sqlalchemy import or_
from sqlalchemy.exc import IntegrityError
from fastapi.encoders import jsonable_encoder
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


# ✅ PUT สำหรับ dynamic-table.js
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


# ---------- /keyset ----------
@router.get("/keyset")
def list_suppliers_keyset(
    q: Optional[str] = Query(None),
    limit: int = Query(25, ge=1, le=200),
    cursor: Optional[str] = Query(None, description="Cursor (id or code)"),
    sort_by: Optional[str] = Query("code"),
    sort_dir: Optional[str] = Query("asc", regex="^(asc|desc)$"),
    db: Session = Depends(get_db),
):
    qry = db.query(Supplier)

    # 🔍 Search
    if q and q.strip():
        like = f"%{q.strip()}%"
        qry = qry.filter(or_(Supplier.code.ilike(like), Supplier.name.ilike(like)))

    # 🧭 Sort whitelist
    valid_fields = {
        "id": Supplier.id,
        "code": Supplier.code,
        "name": Supplier.name,
        "contact": Supplier.contact,
        "email": Supplier.email,
        "phone": Supplier.phone,
        "payment_terms": Supplier.payment_terms,
    }
    sort_col = valid_fields.get(sort_by, Supplier.code)

    # ⏩ Cursor filter (รองรับทั้ง int และ str)
    if cursor:
        if sort_col == Supplier.id:
            try:
                cursor_val = int(cursor)
                qry = qry.filter(sort_col > cursor_val if sort_dir == "asc" else sort_col < cursor_val)
            except ValueError:
                pass
        else:
            qry = qry.filter(sort_col > cursor if sort_dir == "asc" else sort_col < cursor)

    # 📋 Order
    qry = qry.order_by(sort_col.asc() if sort_dir == "asc" else sort_col.desc())

    # ⚙️ Fetch data
    rows = qry.limit(limit + 1).all()
    items = [jsonable_encoder(r) for r in rows[:limit]]
    has_more = len(rows) > limit

    next_cursor = None
    if items:
        last = rows[limit - 1] if len(rows) >= limit else rows[-1]
        next_cursor = getattr(last, sort_by if sort_by in valid_fields else "code", None)

    return {"items": items, "next_cursor": next_cursor, "has_more": has_more}
