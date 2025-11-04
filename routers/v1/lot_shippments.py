from fastapi import APIRouter, Depends, HTTPException, Body
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func
from datetime import datetime
from pydantic import BaseModel

from database import get_db
from models import (
    ProductionLot,
    CustomerShipment,
    CustomerShipmentItem,
    Part,
)

router = APIRouter(prefix="/lot-shippments", tags=["lot-shippments"])

class AllocatePartRequest(BaseModel):
    source_lot_id: int
    target_lot_id: int
    qty: float
# ---------- Helper ----------
def get_lot_or_404(db: Session, lot_id: int) -> ProductionLot:
    lot = db.get(ProductionLot, lot_id)
    if not lot:
        raise HTTPException(status_code=404, detail="Lot not found")
    return lot


def get_part_inventory_data(db: Session, lot_id: int):
    lot = get_lot_or_404(db, lot_id)
    part = db.get(Part, lot.part_id)
    if not part:
        raise HTTPException(status_code=404, detail="Part not found")

    # ✅ ใช้ traveler steps เพื่อคำนวณ finished_qty
    from models import ShopTraveler, ShopTravelerStep

    sub_max_seq = (
        db.query(
            ShopTravelerStep.traveler_id,
            func.max(ShopTravelerStep.seq).label("max_seq"),
        )
        .group_by(ShopTravelerStep.traveler_id)
        .subquery()
    )

    finished_qty = (
        db.query(func.coalesce(func.sum(ShopTravelerStep.qty_accept), 0))
        .join(
            sub_max_seq,
            (ShopTravelerStep.traveler_id == sub_max_seq.c.traveler_id)
            & (ShopTravelerStep.seq == sub_max_seq.c.max_seq),
        )
        .join(ShopTraveler, ShopTraveler.id == ShopTravelerStep.traveler_id)
        .filter(ShopTraveler.lot_id == lot.id)
        .filter(ShopTravelerStep.status.in_(["passed", "completed"]))  # ✅ fixed
        .scalar()
        or 0
    )

    shipped_qty = (
        db.query(func.sum(CustomerShipmentItem.qty))
        .filter(CustomerShipmentItem.lot_id == lot_id)
        .scalar()
        or 0
    )

    planned_qty = float(lot.planned_qty or 0)
    finished_qty = float(finished_qty)
    shipped_qty = float(shipped_qty)
    available_qty = max(finished_qty - shipped_qty, 0)

    return part, planned_qty, finished_qty, shipped_qty, available_qty


# ============================================================
# 1️⃣  List shipments for a lot
# ============================================================
@router.get("/{lot_id}")
def list_lot_shipments(lot_id: int, db: Session = Depends(get_db)):
    q = (
        db.query(CustomerShipment)
        .join(CustomerShipment.items)
        .filter(CustomerShipmentItem.lot_id == lot_id)
        .order_by(CustomerShipment.shipped_at.desc())
    )

    rows = q.all()

    return [
        {
            "id": s.id,
            "shipment_no": s.package_no or f"SHP-{s.id}",
            "ship_to": s.ship_to,
            "carrier": s.carrier,
            "tracking_no": s.tracking_no,
            "qty": sum(float(i.qty or 0) for i in s.items if i.lot_id == lot_id),
            "uom": "pcs",
            "status": s.status or "pending",
            "date": s.shipped_at,
        }
        for s in rows
    ]


# ============================================================
# 2️⃣  Allocate / Return part
# ============================================================
class PartQtyRequest(BaseModel):
    lot_id: int
    qty: float


def get_or_create_shipment(db: Session, lot: ProductionLot):
    shipment = (
        db.query(CustomerShipment)
        .filter(CustomerShipment.po_id == lot.po_id)
        .order_by(CustomerShipment.id.desc())
        .first()
    )
    if not shipment:
        shipment = CustomerShipment(
            po_id=lot.po_id,
            shipped_at=datetime.now(),
            status="pending",
        )
        db.add(shipment)
        db.flush()
    return shipment

class AllocatePartRequest(BaseModel):
    source_lot_id: int  # ✅ lot ต้นทาง
    target_lot_id: int  # ✅ lot ปลายทาง (shipment lot)
    qty: float

@router.post("/allocate-part")
def allocate_part(req: AllocatePartRequest, db: Session = Depends(get_db)):
    from models import ShopTraveler, ShopTravelerStep

    source_lot = db.get(ProductionLot, req.source_lot_id)
    target_lot = db.get(ProductionLot, req.target_lot_id)

    if not source_lot or not target_lot:
        raise HTTPException(status_code=404, detail="Lot not found")

    qty = float(req.qty)
    if qty <= 0:
        raise HTTPException(status_code=400, detail="Quantity must be greater than zero")

    # --- คำนวณ available จาก source lot ---
    sub_max_seq = (
        db.query(
            ShopTravelerStep.traveler_id,
            func.max(ShopTravelerStep.seq).label("max_seq"),
        )
        .group_by(ShopTravelerStep.traveler_id)
        .subquery()
    )

    finished_qty = (
        db.query(func.coalesce(func.sum(ShopTravelerStep.qty_accept), 0))
        .join(
            sub_max_seq,
            (ShopTravelerStep.traveler_id == sub_max_seq.c.traveler_id)
            & (ShopTravelerStep.seq == sub_max_seq.c.max_seq),
        )
        .join(ShopTraveler, ShopTraveler.id == ShopTravelerStep.traveler_id)
        .filter(ShopTraveler.lot_id == source_lot.id)
        .filter(ShopTravelerStep.status.in_(["passed", "completed"]))
        .scalar()
        or 0
    )

    shipped_qty = (
        db.query(func.coalesce(func.sum(CustomerShipmentItem.qty), 0))
        .filter(CustomerShipmentItem.lot_id == source_lot.id)
        .scalar()
        or 0
    )

    available_qty = float(finished_qty) - float(shipped_qty)
    if qty > available_qty:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot allocate {qty} pcs — only {available_qty} available in {source_lot.lot_no}",
        )

    # --- ผูก shipment ของ target lot ---
    shipment = get_or_create_shipment(db, target_lot)
    new_item = CustomerShipmentItem(
        shipment_id=shipment.id,
        po_line_id=target_lot.po_line_id or 0,
        lot_id=source_lot.id,  # ✅ ของมาจาก lot ต้นทาง
        qty=qty,
    )

    db.add(new_item)
    db.commit()
    db.refresh(new_item)

    return {
        "status": "ok",
        "from": source_lot.lot_no,
        "to": target_lot.lot_no,
        "allocated_qty": qty,
        "available_after": available_qty - qty,
    }


@router.post("/return-part")
def return_part(req: dict = Body(...), db: Session = Depends(get_db)):
    source_lot_id = req.get("source_lot_id")
    target_lot_id = req.get("target_lot_id")
    qty = float(req.get("qty", 0))

    if not source_lot_id:
        raise HTTPException(status_code=400, detail="Missing source_lot_id")
    if qty <= 0:
        raise HTTPException(status_code=400, detail="Quantity must be > 0")

    # ✅ คืนของจาก lot ต้นทาง (ที่เคย allocate ออกไป)
    items = (
        db.query(CustomerShipmentItem)
        .join(CustomerShipment, CustomerShipment.id == CustomerShipmentItem.shipment_id)
        .filter(CustomerShipment.po_id == ProductionLot.po_id)
        .filter(CustomerShipmentItem.lot_id == source_lot_id)
        .order_by(CustomerShipmentItem.id.desc())
        .all()
    )

    remain = qty
    total_returned = 0.0

    for it in items:
        if remain <= 0:
            break
        if it.qty <= remain:
            remain -= float(it.qty)
            total_returned += float(it.qty)
            db.delete(it)
        else:
            it.qty = float(it.qty) - remain
            total_returned += remain
            remain = 0

    db.commit()

    if total_returned == 0:
        raise HTTPException(status_code=400, detail="No part available to return")

    return {
        "status": "returned",
        "returned_qty": total_returned,
        "source_lot_id": source_lot_id,
        "target_lot_id": target_lot_id,
    }

# ============================================================
# 3️⃣  Delete shipment
# ============================================================
@router.delete("/{shipment_id}")
def delete_shipment(shipment_id: int, db: Session = Depends(get_db)):
    s = db.get(CustomerShipment, shipment_id)
    if not s:
        raise HTTPException(status_code=404, detail="Shipment not found")
    db.delete(s)
    db.commit()
    return {"status": "deleted", "shipment_id": shipment_id}


# ============================================================
# 4️⃣  Shipment history
# ============================================================
@router.get("/history/{lot_id}")
def shipment_history(lot_id: int, db: Session = Depends(get_db)):
    rows = (
        db.query(CustomerShipment)
        .join(CustomerShipment.items)
        .filter(CustomerShipmentItem.lot_id == lot_id)
        .order_by(CustomerShipment.shipped_at.desc())
        .all()
    )
    return [
        {
            "id": r.id,
            "shipment_no": r.package_no or f"SHP-{r.id:05d}",
            "qty": sum(float(i.qty or 0) for i in r.items if i.lot_id == lot_id),
            "uom": "pcs",
            "status": r.status or "pending",
            "created_at": r.shipped_at,
        }
        for r in rows
    ]


# ============================================================
# 5️⃣  Header info
# ============================================================
@router.get("/lot/{lot_id}/header")
def get_lot_header(lot_id: int, db: Session = Depends(get_db)):
    lot = (
        db.query(ProductionLot)
        .options(joinedload(ProductionLot.part))
        .filter(ProductionLot.id == lot_id)
        .first()
    )
    if not lot:
        raise HTTPException(status_code=404, detail="Lot not found")

    part, planned, finished, shipped, available = get_part_inventory_data(db, lot.id)

    return {
        "lot_id": lot.id,
        "lot_no": lot.lot_no,
        "part_no": part.part_no if part else None,
        "planned_qty": planned,
        "finished_qty": finished,
        "shipped_qty": shipped,
        "available_qty": available,
        "status": lot.status,
        "due_date": lot.lot_due_date,
    }


# ============================================================
# 6️⃣  Part inventory + progress
# ============================================================
@router.get("/lot/{lot_id}/part-inventory")
def get_part_inventory(lot_id: int, db: Session = Depends(get_db)):
    part, planned, finished, shipped, available = get_part_inventory_data(db, lot_id)
    progress_percent = round(finished / planned * 100, 2) if planned > 0 else 0
    return {
        "part_id": part.id,
        "part_no": part.part_no,
        "lot_id": lot_id,
        "planned_qty": planned,
        "finished_qty": finished,
        "shipped_qty": shipped,
        "available_qty": available,
        "progress_percent": progress_percent,
        "uom": getattr(part, "uom", "pcs"),
    }


# ============================================================
# 7️⃣  Update status
# ============================================================
@router.patch("/{shipment_id}/status")
def update_shipment_status(
    shipment_id: int, data: dict = Body(...), db: Session = Depends(get_db)
):
    s = db.get(CustomerShipment, shipment_id)
    if not s:
        raise HTTPException(status_code=404, detail="Shipment not found")

    new_status = data.get("status")
    if new_status not in ["pending", "shipped", "cancelled"]:
        raise HTTPException(status_code=400, detail="Invalid status")

    s.status = new_status
    db.commit()
    return {"status": "ok", "shipment_id": s.id, "new_status": s.status}




# ============================================================
# 6️⃣  Part inventory (ทุก lot ของ part เดียวกัน)
# ============================================================
@router.get("/lot/{lot_id}/part-inventory/all")
def get_part_inventory_all_for_same_part(lot_id: int, db: Session = Depends(get_db)):
    lot = get_lot_or_404(db, lot_id)
    part_id = lot.part_id

    lots = db.query(ProductionLot).filter(ProductionLot.part_id == part_id).all()
    results = []

    for l in lots:
        part, planned, finished, shipped, available = get_part_inventory_data(db, l.id)
        progress_percent = round(finished / planned * 100, 2) if planned > 0 else 0
        results.append({
            "lot_id": l.id,
            "lot_no": l.lot_no,
            "part_no": part.part_no,
            "planned_qty": planned,
            "finished_qty": finished,
            "shipped_qty": shipped,
            "available_qty": available,
            "progress_percent": progress_percent,
            "uom": getattr(part, "uom", "pcs"),
        })

    return results