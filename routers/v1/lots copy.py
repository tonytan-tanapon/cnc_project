# routers/lots.py
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from sqlalchemy import or_
from typing import List, Optional

from database import get_db
from models import ProductionLot, Part, PartRevision, PO
from schemas import ProductionLotCreate, ProductionLotUpdate, ProductionLotOut
from utils.code_generator import next_code_yearly  # หรือ next_code ถ้าไม่ผูกปี

router = APIRouter(prefix="/lots", tags=["lots"])


@router.post("", response_model=ProductionLotOut)
def create_lot(payload: ProductionLotCreate, db: Session = Depends(get_db)):
    """
    สร้าง Lot ใหม่
    - รองรับ lot_no = "", "AUTO", "AUTOGEN" -> gen อัตโนมัติ
    - กันเลขซ้ำ + กัน race ด้วย retry
    - ตรวจความสัมพันธ์ part / part_revision / po ให้ถูกต้อง
    """
    # ตรวจ PO (ถ้าส่งมา)
    if payload.po_id is not None and not db.get(PO, payload.po_id):
        raise HTTPException(404, "PO not found")

    # ตรวจ Part
    part = db.get(Part, payload.part_id)
    if not part:
        raise HTTPException(404, "Part not found")

    # ตรวจ Revision ให้ตรงกับ Part (ถ้าส่งมา)
    if payload.part_revision_id is not None:
        prv = db.get(PartRevision, payload.part_revision_id)
        if not prv or prv.part_id != part.id:
            raise HTTPException(400, "part_revision_id does not belong to part_id")

    # lot_no รองรับ autogen
    raw = (payload.lot_no or "").strip().upper()
    autogen = raw in ("", "AUTO", "AUTOGEN")
    lot_no = next_code_yearly(db, ProductionLot, "lot_no", prefix="LOT") if autogen else raw

    # กันเลขซ้ำแบบ pre-check
    if db.query(ProductionLot).filter(ProductionLot.lot_no == lot_no).first():
        raise HTTPException(409, "Lot number already exists")

    lot = ProductionLot(
        lot_no=lot_no,
        part_id=payload.part_id,
        part_revision_id=payload.part_revision_id,
        po_id=payload.po_id,
        planned_qty=payload.planned_qty or 0,
        started_at=payload.started_at,
        finished_at=payload.finished_at,
        status=payload.status or "in_process",
    )

    # กัน race condition ตอน autogen
    for _ in range(3):
        try:
            db.add(lot)
            db.commit()
            db.refresh(lot)
            return lot
        except IntegrityError:
            db.rollback()
            if autogen:
                lot.lot_no = next_code_yearly(db, ProductionLot, "lot_no", prefix="LOT")
            else:
                # ไม่ autogen แต่ชน unique -> รายงานออกไป
                raise HTTPException(409, "Lot number already exists")

    raise HTTPException(500, "Failed to generate unique lot number")


@router.get("", response_model=List[ProductionLotOut])
def list_lots(
    q: Optional[str] = Query(None, description="ค้นหา lot_no / status"),
    db: Session = Depends(get_db),
):
    query = db.query(ProductionLot)
    if q:
        ql = f"%{q}%"
        query = query.filter(or_(
            ProductionLot.lot_no.ilike(ql),
            ProductionLot.status.ilike(ql),
        ))
    return query.order_by(ProductionLot.id.desc()).all()


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

    # เปลี่ยนเลข lot_no ต้องไม่ซ้ำ + normalize เป็น upper().strip()
    if "lot_no" in data and data["lot_no"]:
        new_no = data["lot_no"].strip().upper()
        dup = db.query(ProductionLot).filter(
            ProductionLot.lot_no == new_no,
            ProductionLot.id != lot_id
        ).first()
        if dup:
            raise HTTPException(409, "Lot number already exists")
        lot.lot_no = new_no
        del data["lot_no"]

    # ตรวจ PO (ถ้าจะเปลี่ยน)
    if "po_id" in data and data["po_id"] is not None:
        if not db.get(PO, data["po_id"]):
            raise HTTPException(404, "PO not found")

    # ตรวจ Part (ถ้าจะเปลี่ยน)
    if "part_id" in data and data["part_id"] is not None:
        if not db.get(Part, data["part_id"]):
            raise HTTPException(404, "Part not found")

    # ตรวจ Revision ให้ตรง Part (เผื่อมีการเปลี่ยนฝั่งใดฝั่งหนึ่ง)
    if "part_revision_id" in data and data["part_revision_id"] is not None:
        prv = db.get(PartRevision, data["part_revision_id"])  # type: ignore[index]
        if not prv:
            raise HTTPException(404, "Part revision not found")
        part_id = data.get("part_id", lot.part_id)
        if prv.part_id != part_id:
            raise HTTPException(400, "part_revision_id does not belong to part_id")

    # อัปเดตฟิลด์อื่น ๆ
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
    # ตัวอย่าง rule ธุรกิจ: มีการใช้วัตถุดิบแล้วห้ามลบ
    if lot.material_uses and len(lot.material_uses) > 0:
        raise HTTPException(400, "Lot has material usage; cannot delete")
    db.delete(lot)
    db.commit()
    return {"message": "Lot deleted"}
