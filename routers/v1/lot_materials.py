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
        .options(joinedload(LotMaterialUse.batch).joinedload(RawBatch.material))
        .filter(LotMaterialUse.lot_id == lot_id)
        .order_by(LotMaterialUse.used_at.desc())
    )
    items = q.all()
    return [
        {
            "id": x.id,
            "lot_id": x.lot_id,
            "material_code": x.raw_material.code if x.raw_material else None,
            "material_name": x.raw_material.name if x.raw_material else None,
            "batch_id": x.batch_id,
            "batch_no": x.batch.batch_no if x.batch else None,
            "qty": float(x.qty or 0),
            "uom": x.uom,
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
    material_code: str
    qty: float
    strategy: str = "fifo"


@router.post("/allocate")
def allocate_material(req: AllocateRequest, db: Session = Depends(get_db)):
    lot_id = req.lot_id
    material_code = req.material_code
    qty = req.qty
    if qty <= 0:
        raise HTTPException(status_code=400, detail="Quantity must be > 0")

    lot = get_lot_or_404(db, lot_id)
    mat = db.execute(select(RawMaterial).where(RawMaterial.code == material_code)).scalar_one_or_none()
    if not mat:
        raise HTTPException(status_code=404, detail=f"Material {material_code} not found")

    batches = (
        db.query(RawBatch)
        .filter(RawBatch.material_id == mat.id)
        .filter((RawBatch.qty_received - RawBatch.qty_used_calc) > 0)
        .order_by(asc(RawBatch.received_at))
        .all()
    )

    if not batches:
        raise HTTPException(status_code=404, detail="No available batches to allocate")

    remain = qty
    allocations = []

    for b in batches:
        avail = float(b.qty_received or 0) - float(b.qty_used_calc or 0)
        if avail <= 0:
            continue
        use = min(avail, remain)
        if use <= 0:
            break

        rec = LotMaterialUse(
            lot_id=lot.id,
            batch_id=b.id,
            raw_material_id=mat.id,
            qty=use,
            uom=mat.uom,
            used_at=datetime.now(),
        )
        db.add(rec)

        # ✅ Add to history log
        db.add(LotMaterialUseHistory(
            lot_id=lot.id,
            raw_material_id=mat.id,
            batch_id=b.id,
            qty=use,
            uom=mat.uom,
            action="ALLOCATE",
        ))

        allocations.append({"batch_no": b.batch_no, "allocated": use})
        remain -= use
        if remain <= 0:
            break

    if remain > 0:
        raise HTTPException(status_code=400, detail=f"Not enough stock; {remain:.3f} {mat.uom} short")

    db.commit()
    return {
        "status": "ok",
        "material": material_code,
        "allocated_qty": qty,
        "items": allocations,
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
                uom=alloc.uom,
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
