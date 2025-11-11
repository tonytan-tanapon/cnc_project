from decimal import Decimal
from typing import List, Optional, Literal
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, field_validator
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError

from database import get_db
from models import ProductionLot, LotMaterialUse, RawBatch, RawMaterial

router = APIRouter(prefix="/lot-uses", tags=["lot-uses"])


# ===============================
# 📦 MODEL SCHEMAS
# ===============================
class AllocateIn(BaseModel):
    lot_id: int
    qty: Decimal
    batch_id: Optional[int] = None
    material_id: Optional[int] = None
    material_code: Optional[str] = None
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


# ===============================
# 🔹 ALLOCATE MATERIAL
# ===============================
@router.post("/allocate", response_model=AllocateOut)
def allocate_material(payload: AllocateIn, db: Session = Depends(get_db)):
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

        # หักสต็อกจาก batch
        batch.qty_used = (batch.qty_used or 0) + take

        created_items.append(
            AllocationItem(
                lot_id=lot.id,
                batch_id=batch.id,
                material_code=batch.material.code if batch.material else "",
                batch_no=batch.batch_no or "",
                qty=take,
                uom=batch.material.uom if batch.material else None,
            )
        )

    # ถ้ามี batch_id → ตัด batch เดียว
    if payload.batch_id:
        batch = (
            db.query(RawBatch)
            .options(joinedload(RawBatch.material))
            .filter(RawBatch.id == payload.batch_id)
            .first()
        )
        if not batch:
            raise HTTPException(404, "Batch not found")

        avail = Decimal(batch.qty_available_calc or 0)
        if avail <= 0:
            raise HTTPException(400, "Batch has no available quantity")

        take = min(avail, remaining)
        _create_use(batch, take)
        remaining -= take

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

        # หา batch ของวัสดุนั้น
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

    try:
        db.commit()
    except IntegrityError as e:
        db.rollback()
        raise HTTPException(400, f"Allocation failed: {str(e)}")

    allocated = requested - remaining
    if allocated <= 0:
        raise HTTPException(400, "No quantity allocated (no available stock?)")

    return AllocateOut(
        requested_qty=requested,
        allocated_qty=allocated,
        items=created_items,
    )


# ===============================
# 🔹 RETURN MATERIAL (คืนสต็อก)
# ===============================
class MaterialReturnIn(BaseModel):
    lot_id: int
    material_code: str
    batch_no: str
    qty: float


@router.post("/return")
def return_material(payload: MaterialReturnIn, db: Session = Depends(get_db)):
    """คืนวัสดุกลับเข้าคลัง"""
    lot = db.get(ProductionLot, payload.lot_id)
    if not lot:
        raise HTTPException(404, "Lot not found")

    # หา allocation เดิม
    alloc = (
        db.query(LotMaterialUse)
        .join(RawBatch, RawBatch.id == LotMaterialUse.batch_id)
        .join(RawMaterial, RawMaterial.id == RawBatch.material_id)
        .filter(
            LotMaterialUse.lot_id == payload.lot_id,
            RawMaterial.code == payload.material_code,
            RawBatch.batch_no == payload.batch_no,
        )
        .first()
    )
    if not alloc:
        raise HTTPException(404, "Allocation not found for return")

    if payload.qty <= 0:
        raise HTTPException(400, "Return qty must be positive")
    if payload.qty > alloc.qty:
        raise HTTPException(400, "Return qty exceeds allocated qty")

    # หักออกจาก allocation เดิม
    alloc.qty -= payload.qty
    batch = alloc.batch
    if batch:
        batch.qty_used = (batch.qty_used or 0) - payload.qty
        if batch.qty_used < 0:
            batch.qty_used = 0

    # ถ้าเหลือ 0 ให้ลบ allocation
    if alloc.qty <= 0:
        db.delete(alloc)

    # เพิ่ม record ประวัติ return
    db.add(
        LotMaterialUse(
            lot_id=payload.lot_id,
            batch_id=batch.id if batch else None,
            qty=-abs(payload.qty),
            uom=batch.material.uom if batch and batch.material else None,
            note="Returned to inventory",
            action="return",
        )
    )

    db.commit()
    return {"ok": True, "message": f"Returned {payload.qty} of {payload.material_code}"}


# ===============================
# 🔹 LIST ALLOCATIONS
# ===============================
@router.get("/{lot_id}", response_model=List[AllocationItem])
def list_uses(lot_id: int, db: Session = Depends(get_db)):
    rows = (
        db.query(LotMaterialUse)
        .options(joinedload(LotMaterialUse.batch).joinedload(RawBatch.material))
        .filter(LotMaterialUse.lot_id == lot_id)
        .order_by(LotMaterialUse.id)
        .all()
    )
    return [
        AllocationItem(
            lot_id=r.lot_id,
            batch_id=r.batch_id,
            material_code=r.batch.material.code if r.batch and r.batch.material else "",
            batch_no=r.batch.batch_no or "",
            qty=r.qty,
            uom=r.uom,
        )
        for r in rows
    ]


# ===============================
# 🔹 UPDATE / DELETE
# ===============================
@router.patch("/{id}", response_model=AllocationItem)
def update_use(id: int, payload: dict, db: Session = Depends(get_db)):
    use = db.get(LotMaterialUse, id)
    if not use:
        raise HTTPException(404, "Use record not found")
    for key in ["qty", "note"]:
        if key in payload:
            setattr(use, key, payload[key])
    db.commit()
    db.refresh(use)
    return AllocationItem(
        lot_id=use.lot_id,
        batch_id=use.batch_id,
        material_code=use.batch.material.code if use.batch and use.batch.material else "",
        batch_no=use.batch.batch_no or "",
        qty=use.qty,
        uom=use.uom,
    )


@router.delete("/{id}", status_code=204)
def delete_use(id: int, db: Session = Depends(get_db)):
    use = db.get(LotMaterialUse, id)
    if not use:
        raise HTTPException(404, "Use record not found")
    db.delete(use)
    db.commit()


# ===============================
# 🔹 LOT HEADER
# ===============================
@router.get("/lot/{lot_id}/header")
def get_lot_header(lot_id: int, db: Session = Depends(get_db)):
    print("Fetching header for lot ID:", lot_id)
    lot = db.query(ProductionLot).filter(ProductionLot.id == lot_id).first()
    if not lot:
        raise HTTPException(404, "Lot not found")

    return {
        "lot_no": lot.lot_no,
        "status": lot.status,
        "due_date": str(lot.lot_due_date) if lot.lot_due_date else None,
        "planned_qty": lot.planned_qty,
        "note": lot.note,
        "part": {
            "id": lot.part_id if lot.part else None,
            "part_no": lot.part.part_no if lot.part else None,
        },
        "po": lot.po_id,
    }
