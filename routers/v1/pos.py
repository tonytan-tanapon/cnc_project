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
