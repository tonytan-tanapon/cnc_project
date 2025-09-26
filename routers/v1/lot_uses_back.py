# routers/lot_uses.py
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from decimal import Decimal

from database import get_db
from models import ProductionLot, RawBatch, LotMaterialUse
from schemas import LotMaterialUseCreate, LotMaterialUseUpdate, LotMaterialUseOut

router = APIRouter(prefix="/lot-uses", tags=["lot_uses"])


def _assert_batch_capacity(batch: RawBatch, qty_delta: Decimal):
    if (batch.qty_used + qty_delta) > batch.qty_received:
        raise HTTPException(400, "Not enough batch balance")


@router.post("", response_model=LotMaterialUseOut)
def create_lot_use(payload: LotMaterialUseCreate, db: Session = Depends(get_db)):
    lot = db.get(ProductionLot, payload.lot_id)
    batch = db.get(RawBatch, payload.batch_id)
    if not lot:
        raise HTTPException(404, "Lot not found")
    if not batch:
        raise HTTPException(404, "Batch not found")

    qty = Decimal(str(payload.qty))
    if qty <= 0:
        raise HTTPException(400, "qty must be > 0")

    _assert_batch_capacity(batch, qty)

    use = LotMaterialUse(lot_id=lot.id, batch_id=batch.id, qty=qty)
    batch.qty_used = batch.qty_used + qty
    db.add(use)
    db.commit()
    db.refresh(use)
    return use


@router.get("", response_model=List[LotMaterialUseOut])
def list_lot_uses(db: Session = Depends(get_db)):
    return db.query(LotMaterialUse).order_by(LotMaterialUse.id.desc()).all()


@router.get("/{use_id}", response_model=LotMaterialUseOut)
def get_lot_use(use_id: int, db: Session = Depends(get_db)):
    u = db.get(LotMaterialUse, use_id)
    if not u:
        raise HTTPException(404, "Usage not found")
    return u


@router.put("/{use_id}", response_model=LotMaterialUseOut)
def update_lot_use(use_id: int, payload: LotMaterialUseUpdate, db: Session = Depends(get_db)):
    u = db.get(LotMaterialUse, use_id)
    if not u:
        raise HTTPException(404, "Usage not found")

    new_qty = Decimal(str(payload.qty))
    if new_qty <= 0:
        raise HTTPException(400, "qty must be > 0")

    batch = db.get(RawBatch, u.batch_id)
    delta = new_qty - u.qty
    if delta != 0:
        _assert_batch_capacity(batch, delta)  # type: ignore[arg-type]
        u.qty = new_qty
        batch.qty_used = batch.qty_used + delta  # type: ignore[operator]

    db.commit()
    db.refresh(u)
    return u


@router.delete("/{use_id}")
def delete_lot_use(use_id: int, db: Session = Depends(get_db)):
    u = db.get(LotMaterialUse, use_id)
    if not u:
        raise HTTPException(404, "Usage not found")
    batch = db.get(RawBatch, u.batch_id)
    batch.qty_used = batch.qty_used - u.qty  # type: ignore[operator]
    db.delete(u)
    db.commit()
    return {"message": "Usage deleted"}
