# routers/suppliers.py
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List

from database import get_db
from models import Supplier
from schemas import SupplierCreate, SupplierUpdate, SupplierOut

router = APIRouter(prefix="/suppliers", tags=["suppliers"])


@router.post("", response_model=SupplierOut)
def create_supplier(payload: SupplierCreate, db: Session = Depends(get_db)):
    code = payload.code.strip().upper()
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
    db.add(s)
    db.commit()
    db.refresh(s)
    return s


@router.get("", response_model=List[SupplierOut])
def list_suppliers(q: str | None = Query(None), db: Session = Depends(get_db)):
    query = db.query(Supplier)
    if q:
        ql = f"%{q}%"
        query = query.filter((Supplier.code.ilike(ql)) | (Supplier.name.ilike(ql)))
    return query.order_by(Supplier.name.asc()).all()


@router.get("/{supplier_id}", response_model=SupplierOut)
def get_supplier(supplier_id: int, db: Session = Depends(get_db)):
    s = db.get(Supplier, supplier_id)
    if not s:
        raise HTTPException(404, "Supplier not found")
    return s


@router.put("/{supplier_id}", response_model=SupplierOut)
def update_supplier(supplier_id: int, payload: SupplierUpdate, db: Session = Depends(get_db)):
    s = db.get(Supplier, supplier_id)
    if not s:
        raise HTTPException(404, "Supplier not found")

    for k, v in payload.dict(exclude_unset=True).items():
        setattr(s, k, v)

    db.commit()
    db.refresh(s)
    return s


@router.delete("/{supplier_id}")
def delete_supplier(supplier_id: int, db: Session = Depends(get_db)):
    s = db.get(Supplier, supplier_id)
    if not s:
        raise HTTPException(404, "Supplier not found")
    if s.raw_batches:
        raise HTTPException(400, "Supplier in use (raw_batches); cannot delete")
    db.delete(s)
    db.commit()
    return {"message": "Supplier deleted"}
