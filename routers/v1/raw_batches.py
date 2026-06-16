# routers/raw_batches.py
from fastapi import APIRouter, Depends, Query, Response

from sqlalchemy import text
from sqlalchemy.orm import Session

from schemas import RawBatchCreate
from models import RawBatch

from database import get_db  # <- your SessionLocal provider


router = APIRouter(prefix="/raw_batches", tags=["raw_batches"])

@router.post("/raw-batches")
def create_batch(
    payload: RawBatchCreate,
    db: Session = Depends(get_db)
):
    print("Save", payload)
    row = RawBatch(
        batch_no=payload.batch_no,
        material_id=payload.material_id,
        supplier_id=payload.supplier_id,
        heat_lot=payload.heat_lot,
        size_text=payload.size_text,
        length_text=payload.length_text,
        qty_received=payload.qty_received
    )

    db.add(row)
    db.commit()

    return {"ok": True}