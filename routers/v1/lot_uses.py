# routers/lot_uses.py
from decimal import Decimal
from typing import List, Optional, Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, field_validator
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import select, func
from sqlalchemy.exc import IntegrityError

from database import get_db
from models import (
    ProductionLot, LotMaterialUse, RawBatch, RawMaterial,
)

router = APIRouter(prefix="/lot-uses", tags=["lot-uses"])


class AllocateIn(BaseModel):
    lot_id: int
    qty: Decimal
    # เลือกอย่างใดอย่างหนึ่ง: batch_id | material_id | material_code
    batch_id: Optional[int] = None
    material_id: Optional[int] = None
    material_code: Optional[str] = None

    # ถ้าไม่ได้ระบุ batch_id ให้เลือก batch ตามกลยุทธ์นี้
    strategy: Literal["fifo", "lifo"] = "fifo"
    note: Optional[str] = None

    @field_validator("qty")
    @classmethod
    def _qty_pos(cls, v: Decimal):
        if v is None or v <= 0:
            raise ValueError("qty must be > 0")
        return v


class AllocationItem(BaseModel):
    lot_id: int
    batch_id: int
    material_code: str
    batch_no: str
    qty: Decimal
    uom: Optional[str] = None


class AllocateOut(BaseModel):
    requested_qty: Decimal
    allocated_qty: Decimal
    items: List[AllocationItem]


@router.post("/allocate", response_model=AllocateOut)
def allocate_material(payload: AllocateIn, db: Session = Depends(get_db)):
    # 1) ตรวจ lot
    lot = db.get(ProductionLot, payload.lot_id)
    if not lot:
        raise HTTPException(404, "Lot not found")

    requested = Decimal(payload.qty)
    remaining = requested
    created_items: list[AllocationItem] = []

    def _create_use(batch: RawBatch, take: Decimal):
        lmu = LotMaterialUse(
            lot_id=lot.id,
            batch_id=batch.id,
            qty=take,
            uom=batch.material.uom if batch.material and batch.material.uom else None,
            note=payload.note,
        )
        db.add(lmu)
        # commit ทีเดียวด้านล่าง; ให้ listener เช็ค stock และเติม raw_material_id

        created_items.append(
            AllocationItem(
                lot_id=lot.id,
                batch_id=batch.id,
                material_code=batch.material.code if batch.material else "",
                batch_no=batch.batch_no or "",
                qty=take,
                uom=(batch.material.uom if batch.material else None),
            )
        )

    # 2) ถ้าระบุ batch_id → ตัดจาก batch นั้นก้อนเดียว
    if payload.batch_id:
        batch = (
            db.query(RawBatch)
            .options(joinedload(RawBatch.material))
            .filter(RawBatch.id == payload.batch_id)
            .first()
        )
        if not batch:
            raise HTTPException(404, "Batch not found")

        # เช็คยอดคงเหลือ batch: qty_available_calc = qty_received - used
        # ใช้ฟิลด์คำนวณที่คุณประกาศไว้แล้ว
        avail = Decimal(batch.qty_available_calc or 0)
        if avail <= 0:
            raise HTTPException(400, "Batch has no available quantity")

        take = min(avail, remaining)
        _create_use(batch, take)
        remaining -= take

    # 3) ไม่ได้ระบุ batch_id แต่ระบุมากว้างเป็น material → เดินตัด FIFO/LIFO หลาย batch
    else:
        # หา material_id
        mat_id = None
        if payload.material_id:
            mat_id = payload.material_id
        elif payload.material_code:
            rm = (
                db.query(RawMaterial)
                .filter(RawMaterial.code.ilike(payload.material_code.strip()))
                .first()
            )
            if not rm:
                raise HTTPException(404, "Raw material code not found")
            mat_id = rm.id
        else:
            raise HTTPException(400, "Provide batch_id or material_id/material_code")

        # query batches ของวัสดุนั้นที่ยังมีของเหลือ
        order_clause = (
            RawBatch.received_at.asc() if payload.strategy == "fifo" else RawBatch.received_at.desc()
        )

        batches = (
            db.query(RawBatch)
            .options(joinedload(RawBatch.material))
            .filter(RawBatch.material_id == mat_id)
            .order_by(order_clause, RawBatch.id.asc())
            .all()
        )

        for b in batches:
            if remaining <= 0:
                break
            avail = Decimal(b.qty_available_calc or 0)
            if avail <= 0:
                continue
            take = min(avail, remaining)
            _create_use(b, take)
            remaining -= take

    # 4) commit & ให้ listener ตรวจ limit ไม่เกินรับเข้า
    try:
        db.commit()
    except IntegrityError as e:
        db.rollback()
        # listener ก่อน insert/update ของคุณจะ raise ถ้าเกิน stock
        # ส่ง error กลับให้อ่านง่าย
        raise HTTPException(400, f"Allocation failed: {str(e.orig) if getattr(e, 'orig', None) else str(e)}")

    allocated = requested - remaining
    if allocated <= 0:
        raise HTTPException(400, "No quantity allocated (no available stock?)")

    return AllocateOut(
        requested_qty=requested,
        allocated_qty=allocated,
        items=created_items,
    )
