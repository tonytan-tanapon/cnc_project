# routers/batches.py
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from decimal import Decimal

from database import get_db
from models import RawMaterial, RawBatch
from schemas import RawBatchCreate, RawBatchUpdate, RawBatchOut

router = APIRouter(prefix="/batches", tags=["batches"])


@router.post("", response_model=RawBatchOut)
def create_batch(payload: RawBatchCreate, db: Session = Depends(get_db)):
    # ต้องมี material ก่อน
    if not db.get(RawMaterial, payload.material_id):
        raise HTTPException(404, "Material not found")

    b = RawBatch(
        material_id=payload.material_id,
        batch_no=payload.batch_no.strip(),
        supplier_id=payload.supplier_id,
        supplier_batch_no=payload.supplier_batch_no,
        mill_name=payload.mill_name,
        mill_heat_no=payload.mill_heat_no,
        received_at=payload.received_at,
        qty_received=payload.qty_received,
        qty_used=Decimal("0"),
        cert_file=payload.cert_file,
        location=payload.location,
    )
    db.add(b)
    db.commit()
    db.refresh(b)
    return b


@router.get("", response_model=List[RawBatchOut])
def list_batches(db: Session = Depends(get_db)):
    return db.query(RawBatch).order_by(RawBatch.id.desc()).all()


@router.get("/{batch_id}", response_model=RawBatchOut)
def get_batch(batch_id: int, db: Session = Depends(get_db)):
    b = db.get(RawBatch, batch_id)
    if not b:
        raise HTTPException(404, "Batch not found")
    return b


@router.put("/{batch_id}", response_model=RawBatchOut)
def update_batch(batch_id: int, payload: RawBatchUpdate, db: Session = Depends(get_db)):
    b = db.get(RawBatch, batch_id)
    if not b:
        raise HTTPException(404, "Batch not found")

    data = payload.dict(exclude_unset=True)

    # ปรับ qty_received ต้องไม่ต่ำกว่า qty_used
    if "qty_received" in data and data["qty_received"] is not None:
        new_recv = Decimal(str(data["qty_received"]))
        if new_recv < b.qty_used:
            raise HTTPException(400, "qty_received cannot be less than qty_used")
        b.qty_received = new_recv
        del data["qty_received"]

    # อัปเดตฟิลด์อื่น ๆ
    for k, v in data.items():
        setattr(b, k, v)

    db.commit()
    db.refresh(b)
    return b


@router.delete("/{batch_id}")
def delete_batch(batch_id: int, db: Session = Depends(get_db)):
    b = db.get(RawBatch, batch_id)
    if not b:
        raise HTTPException(404, "Batch not found")
    if b.qty_used > 0 or (b.uses and len(b.uses) > 0):
        raise HTTPException(400, "Batch already used; cannot delete")
    db.delete(b)
    db.commit()
    return {"message": "Batch deleted"}
