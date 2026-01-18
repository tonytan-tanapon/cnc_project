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
    qty_uom: Optional[str] = None


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

    if not payload.batch_id:
        raise HTTPException(400, "batch_id is required for allocation")

    batch = (
        db.query(RawBatch)
        .options(joinedload(RawBatch.material))
        .filter(RawBatch.id == payload.batch_id)
        .first()
    )

    if not batch:
        raise HTTPException(404, "Batch not found")

    requested = Decimal(payload.qty)
    avail = Decimal(batch.qty_available_calc or 0)

    if avail <= 0:
        raise HTTPException(400, "Batch has no available quantity")

    if requested > avail:
        raise HTTPException(400, f"Only {avail} available in this batch")

    # Create allocation
    lmu = LotMaterialUse(
        lot_id=lot.id,
        batch_id=batch.id,
        raw_material_id=batch.material_id,
        qty=requested,
        qty_uom=batch.material.uom if batch.material else None,
        note=payload.note,
    )

    db.add(lmu)
    db.commit()
    db.refresh(lmu)

    return AllocateOut(
        requested_qty=requested,
        allocated_qty=requested,
        items=[
            AllocationItem(
                lot_id=lot.id,
                batch_id=batch.id,
                material_code=batch.material.code if batch.material else "",
                batch_no=batch.batch_no or "",
                qty=requested,
                qty_uom=batch.material.uom if batch.material else None,
            )
        ],
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
    lot = db.get(ProductionLot, payload.lot_id)
    if not lot:
        raise HTTPException(404, "Lot not found")

    if payload.qty <= 0:
        raise HTTPException(400, "Return qty must be positive")

    # หา allocation เดิม (เพื่อ validate)
    alloc = (
        db.query(LotMaterialUse)
        .join(RawBatch, RawBatch.id == LotMaterialUse.batch_id)
        .join(RawMaterial, RawMaterial.id == LotMaterialUse.raw_material_id)
        .filter(
            LotMaterialUse.lot_id == payload.lot_id,
            RawMaterial.code == payload.material_code,
            RawBatch.batch_no == payload.batch_no,
            LotMaterialUse.qty > 0,   # allocate only
        )
        .order_by(LotMaterialUse.used_at.asc())
        .first()
    )

    if not alloc:
        raise HTTPException(404, "Allocation not found for return")

    if payload.qty > alloc.qty:
        raise HTTPException(400, "Return qty exceeds allocated qty")

    batch = alloc.batch

    # ✅ เพิ่ม transaction ใหม่ (qty ติดลบ)
    ret = LotMaterialUse(
        lot_id=payload.lot_id,
        batch_id=batch.id,
        raw_material_id=batch.material_id,
        qty=-Decimal(payload.qty),
        qty_uom=batch.material.uom if batch.material else None,
        note="RETURN",
    )
    db.add(ret)

    db.commit()

    return {
        "ok": True,
        "message": f"Returned {payload.qty} {batch.material.uom if batch.material else ''}",
    }



# ===============================
# 🔹 LIST ALLOCATIONS
# ===============================
@router.get("/{lot_id}", response_model=List[AllocationItem])
def list_uses(lot_id: int, db: Session = Depends(get_db)):
    print("lot test")
    rows = (
        db.query(LotMaterialUse)
        .options(joinedload(LotMaterialUse.batch).joinedload(RawBatch.material))
        .filter(LotMaterialUse.lot_id == lot_id)
        .order_by(LotMaterialUse.id)
        .all()
    )
    print("lot allocate")
    # return [
    #     AllocationItem(
    #         lot_id=r.lot_id,
    #         batch_id=r.batch_id,
    #         material_code=r.batch.material.code if r.batch and r.batch.material else "",
    #         batch_no=r.batch.batch_no or "",
    #         qty=r.qty,
    #         qty_uom=r.qty_uom,
    #     )
    #     for r in rows
    # ]
    return 1

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
        qty_uom=use.qty_uom,
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
