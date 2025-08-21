# routers/lots.py
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from database import get_db
from models import ProductionLot, Part, PartRevision, PO
from schemas import ProductionLotCreate, ProductionLotUpdate, ProductionLotOut

router = APIRouter(prefix="/lots", tags=["lots"])


@router.post("", response_model=ProductionLotOut)
def create_lot(payload: ProductionLotCreate, db: Session = Depends(get_db)):
    # ตรวจ PO (ถ้าส่งมา)
    if payload.po_id is not None and not db.get(PO, payload.po_id):
        raise HTTPException(404, "PO not found")

    # กัน lot_no ซ้ำ
    if db.query(ProductionLot).filter(ProductionLot.lot_no == payload.lot_no).first():
        raise HTTPException(409, "Lot number already exists")

    # ตรวจ part และ revision ว่าอยู่คู่กัน
    part = db.get(Part, payload.part_id)
    if not part:
        raise HTTPException(404, "Part not found")

    if payload.part_revision_id is not None:
        prv = db.get(PartRevision, payload.part_revision_id)
        if not prv or prv.part_id != part.id:
            raise HTTPException(400, "part_revision_id does not belong to part_id")

    lot = ProductionLot(
        lot_no=payload.lot_no.strip(),
        part_id=payload.part_id,
        part_revision_id=payload.part_revision_id,
        po_id=payload.po_id,
        planned_qty=payload.planned_qty,
        started_at=payload.started_at,
        finished_at=payload.finished_at,
        status=payload.status or "in_process",
    )
    db.add(lot)
    db.commit()
    db.refresh(lot)
    return lot


@router.get("", response_model=List[ProductionLotOut])
def list_lots(db: Session = Depends(get_db)):
    return db.query(ProductionLot).order_by(ProductionLot.id.desc()).all()


@router.get("/{lot_id}", response_model=ProductionLotOut)
def get_lot(lot_id: int, db: Session = Depends(get_db)):
    lot = db.get(ProductionLot, lot_id)
    if not lot:
        raise HTTPException(404, "Lot not found")
    return lot


@router.put("/{lot_id}", response_model=ProductionLotOut)
def update_lot(lot_id: int, payload: ProductionLotUpdate, db: Session = Depends(get_db)):
    lot = db.get(ProductionLot, lot_id)
    if not lot:
        raise HTTPException(404, "Lot not found")

    data = payload.dict(exclude_unset=True)

    # ตรวจ PO ใหม่ (ถ้ามีส่งมาจะเปลี่ยน)
    if "po_id" in data and data["po_id"] is not None:
        if not db.get(PO, data["po_id"]):
            raise HTTPException(404, "PO not found")

    # ตรวจ Part ใหม่ (ถ้ามีส่งมาจะเปลี่ยน)
    if "part_id" in data and data["part_id"] is not None:
        if not db.get(Part, data["part_id"]):
            raise HTTPException(404, "Part not found")

    # ตรวจ Revision ว่าตรงกับ Part (ทั้งกรณีเปลี่ยน rev หรือ part)
    if "part_revision_id" in data and data["part_revision_id"] is not None:
        prv = db.get(PartRevision, data["part_revision_id"])  # type: ignore[index]
        if not prv:
            raise HTTPException(404, "Part revision not found")
        part_id = data.get("part_id", lot.part_id)
        if prv.part_id != part_id:
            raise HTTPException(400, "part_revision_id does not belong to part_id")

    # อัปเดตฟิลด์
    for k, v in data.items():
        setattr(lot, k, v)

    db.commit()
    db.refresh(lot)
    return lot


@router.delete("/{lot_id}")
def delete_lot(lot_id: int, db: Session = Depends(get_db)):
    lot = db.get(ProductionLot, lot_id)
    if not lot:
        raise HTTPException(404, "Lot not found")
    if lot.material_uses and len(lot.material_uses) > 0:
        raise HTTPException(400, "Lot has material usage; cannot delete")
    db.delete(lot)
    db.commit()
    return {"message": "Lot deleted"}
