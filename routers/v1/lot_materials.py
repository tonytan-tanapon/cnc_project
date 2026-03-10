from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import select, asc
from datetime import datetime
from pydantic import BaseModel

from database import get_db
from models import (
    ProductionLot, RawBatch, RawMaterial,
    LotMaterialUse, LotMaterialUseHistory  # ✅ include new model
)

router = APIRouter(prefix="/lot-uses", tags=["lot-uses"])


# ---------- Helper ----------
def get_lot_or_404(db: Session, lot_id: int) -> ProductionLot:
    lot = db.get(ProductionLot, lot_id)
    if not lot:
        raise HTTPException(status_code=404, detail="Lot not found")
    return lot


# ============================================================
# 1️⃣  List allocations for a lot
# ============================================================
@router.get("/{lot_id}")
def list_lot_material_uses(lot_id: int, db: Session = Depends(get_db)):
    q = (
        db.query(LotMaterialUse)
        .options(
            joinedload(LotMaterialUse.batch).joinedload(RawBatch.material),
            joinedload(LotMaterialUse.raw_material)  # ✅ ensure material is loaded
        )
        .filter(LotMaterialUse.lot_id == lot_id)
        .order_by(LotMaterialUse.used_at.desc())
    )

    items = q.all()

    return [
        {
            "id": x.id,
            "lot_id": x.lot_id,
            "material_code": x.raw_material.code if x.raw_material else None,   # ✅ fixed
            "material_name": x.raw_material.name if x.raw_material else None, # ✅ fixed
            "batch_id": x.batch_id,
            "batch_no": x.batch.batch_no if x.batch else None,
            "qty": float(x.qty or 0),
            "qty_uom": x.qty_uom,
            "note": x.note,
            "used_at": x.used_at,
        }
        for x in items
    ]



# ============================================================
# 2️⃣  Allocate materials to a lot
# ============================================================
class AllocateRequest(BaseModel):
    lot_id: int
    batch_id: int
    material_code: str | None = None
    qty: float

@router.post("/allocate")
def allocate_material(req: AllocateRequest, db: Session = Depends(get_db)):
    print("test")
    lot = get_lot_or_404(db, req.lot_id)

    if req.qty <= 0:
        raise HTTPException(status_code=400, detail="Quantity must be > 0")

    # Get ONLY the selected batch
    batch = (
        db.query(RawBatch)
        .options(joinedload(RawBatch.material))
        .filter(RawBatch.id == req.batch_id)
        .first()
    )

    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")

    mat = batch.material
    if not mat:
        raise HTTPException(status_code=400, detail="Batch has no material")

    avail = float(batch.qty_received or 0) - float(batch.qty_used_calc or 0)

    if avail <= 0:
        raise HTTPException(status_code=400, detail="Batch has no available stock")

    if req.qty > avail:
        raise HTTPException(
            status_code=400,
            detail=f"Only {avail:.3f} {mat.uom} available in this batch"
        )

    # Create allocation
    rec = LotMaterialUse(
        lot_id=lot.id,
        batch_id=batch.id,
        raw_material_id=mat.id,
        qty=req.qty,
        qty_uom=mat.uom,
        used_at=datetime.now(),
    )
    db.add(rec)

    # History log
    db.add(LotMaterialUseHistory(
        lot_id=lot.id,
        raw_material_id=mat.id,
        batch_id=batch.id,
        qty=req.qty,
        uom=mat.uom,
        action="ALLOCATE",
    ))

    db.commit()

    return {
        "status": "ok",
        "material": mat.code,
        "batch_no": batch.batch_no,
        "allocated_qty": req.qty,
        "available_before": avail,
        "available_after": avail - req.qty,
    }



# ============================================================
# 7️⃣  Return allocated material to inventory (with history)
# ============================================================
class ReturnRequest(BaseModel):
    lot_id: int
    material_code: str
    qty: float  # amount to return


@router.post("/return")
def return_auto(req: ReturnRequest, db: Session = Depends(get_db)):
    lot = get_lot_or_404(db, req.lot_id)
    if req.qty <= 0:
        raise HTTPException(status_code=400, detail="Quantity must be > 0")

    mat = db.execute(select(RawMaterial).where(RawMaterial.code == req.material_code)).scalar_one_or_none()
    if not mat:
        raise HTTPException(status_code=404, detail=f"Material {req.material_code} not found")

    remain = float(req.qty)
    total_returned = 0.0

    allocations = (
        db.query(LotMaterialUse)
        .filter(LotMaterialUse.lot_id == req.lot_id)
        .filter(LotMaterialUse.raw_material_id == mat.id)
        .order_by(LotMaterialUse.used_at.desc())  # LIFO
        .all()
    )

    for alloc in allocations:
        if remain <= 0:
            break

        alloc_qty = float(alloc.qty or 0)

        if alloc_qty <= remain:
            remain -= alloc_qty
            total_returned += alloc_qty

            # ✅ Log to history before delete
            db.add(LotMaterialUseHistory(
                lot_id=alloc.lot_id,
                raw_material_id=alloc.raw_material_id,
                batch_id=alloc.batch_id,
                qty=alloc_qty,
                uom=alloc.qty_uom,
                action="RETURN",
            ))

            db.delete(alloc)
        else:
            alloc.qty = alloc_qty - remain
            total_returned += remain

            db.add(LotMaterialUseHistory(
                lot_id=alloc.lot_id,
                raw_material_id=alloc.raw_material_id,
                batch_id=alloc.batch_id,
                qty=remain,
                uom=alloc.uom,
                action="RETURN",
            ))

            remain = 0

    db.commit()

    if total_returned == 0:
        raise HTTPException(status_code=400, detail="No allocation available to return")

    return {
        "status": "returned",
        "material": req.material_code,
        "returned_qty": round(total_returned, 3),
        "remaining_unreturned": round(remain, 3),
    }


# ============================================================
# 8️⃣  View allocation history log
# ============================================================
@router.get("/history/{lot_id}")
def get_lot_history(lot_id: int, db: Session = Depends(get_db)):
    rows = (
        db.query(LotMaterialUseHistory)
        .filter(LotMaterialUseHistory.lot_id == lot_id)
        .order_by(LotMaterialUseHistory.created_at.desc())
        .all()
    )

    return [
        {
            "id": r.id,
            "lot_id": r.lot_id,
            "batch_id": r.batch_id,
            "qty": float(r.qty or 0),
            "uom": r.uom,
            "action": r.action,
            "created_at": r.created_at,
        }
        for r in rows
    ]


# ============================================================
# 9️⃣  Load lot header (for top panel)
# ============================================================
@router.get("/lot/{lot_id}/header")
def get_lot_header(lot_id: int, db: Session = Depends(get_db)):
    lot = (
        db.query(ProductionLot)
        .options(
            joinedload(ProductionLot.part),
            joinedload(ProductionLot.part_revision),
            joinedload(ProductionLot.po),
        )
        .filter(ProductionLot.id == lot_id)
        .first()
    )

    if not lot:
        raise HTTPException(status_code=404, detail="Lot not found")

    return {
        "lot_id": lot.id,
        "lot_no": lot.lot_no,
        "status": lot.status,
        "planned_qty": lot.planned_qty,
        "part": {
            "part_no": lot.part.part_no if lot.part else None,
            "name": lot.part.name if lot.part else None,
            "part_id": lot.part_id if lot.part else None,
        },
        "revision": lot.part_revision.rev if lot.part_revision else None,
        "po": lot.po.po_number if lot.po else None,
        "due_date": lot.lot_due_date,
        "note": lot.note,
    }

from sqlalchemy import func
@router.get("/lot/{lot_id}/summary")
def get_lot_allocation_summary(lot_id: int, db: Session = Depends(get_db)):
    rows = (
        db.query(
            RawMaterial.name.label("material_name"),
            RawMaterial.uom.label("uom"),
            func.sum(LotMaterialUse.qty).label("total_qty"),
        )
        .join(RawMaterial, RawMaterial.id == LotMaterialUse.raw_material_id)
        .filter(LotMaterialUse.lot_id == lot_id)
        .group_by(RawMaterial.name, RawMaterial.uom)
        .all()
    )

    return [
        {
            "material_name": r.material_name,
            "uom": r.uom,
            "total_qty": float(r.total_qty or 0),
        }
        for r in rows
    ]


@router.get("/lot/{lot_id}/material-id")
def get_material_id(lot_id: int, db: Session = Depends(get_db)):
    from models import ShopTraveler, ProductionLot, RawMaterial
    print("test",lot_id)
    # Example: find the first related traveler → material link
    traveler = (
        db.query(ShopTraveler)
        .filter(ShopTraveler.lot_id == lot_id)
        .first()
    )
    print(traveler)
    if not traveler:
        raise HTTPException(status_code=404, detail="Traveler not found")

    # get material_id from production_lots or traveler if linked
    lot = db.get(ProductionLot, lot_id)
    if not lot:
        raise HTTPException(status_code=404, detail="Lot not found")

    
    print(traveler.id)
    return {"traveler_id": traveler.id}
