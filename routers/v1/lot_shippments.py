from fastapi import APIRouter, Depends, HTTPException
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

    shipped_qty = (
        db.query(func.sum(CustomerShipmentItem.qty))
        .filter(CustomerShipmentItem.lot_id == lot_id)
        .scalar()
        or 0
    )
    planned = float(lot.planned_qty or 0)
    available = planned - float(shipped_qty)
    return part, planned, shipped_qty, available


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
            "status": s.status or "pending",  # ✅ ใช้ค่าจริงจาก DB
            "date": s.shipped_at,
        }
        for s in rows
    ]


# ============================================================
# 2️⃣  Allocate / Return part (real update)
# ============================================================
class PartQtyRequest(BaseModel):
    lot_id: int
    qty: float


def get_or_create_shipment(db: Session, lot: ProductionLot):
    """Use existing latest shipment or create a new one."""
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
            ship_to=None,
            carrier=None,
            tracking_no=None,
            status="pending",
        )
        db.add(shipment)
        db.flush()
    return shipment


@router.post("/allocate-part")
def allocate_part(req: dict, db: Session = Depends(get_db)):
    from models import ProductionLot, Part, CustomerShipmentItem, ShopTraveler, ShopTravelerStep
    lot = db.get(ProductionLot, req["lot_id"])
    if not lot:
        raise HTTPException(status_code=404, detail="Lot not found")

    qty = float(req.get("qty", 0))
    if qty <= 0:
        raise HTTPException(status_code=400, detail="Quantity must be greater than zero")

    # ✅ ดึง available qty ล่าสุด
    sub_max_seq = (
        db.query(
            ShopTravelerStep.traveler_id,
            func.max(ShopTravelerStep.seq).label("max_seq")
        )
        .group_by(ShopTravelerStep.traveler_id)
        .subquery()
    )

    finished_qty = (
        db.query(func.coalesce(func.sum(ShopTravelerStep.qty_accept), 0))
        .join(ShopTraveler, ShopTraveler.id == ShopTravelerStep.traveler_id)
        .join(
            sub_max_seq,
            (sub_max_seq.c.traveler_id == ShopTravelerStep.traveler_id)
            & (sub_max_seq.c.max_seq == ShopTravelerStep.seq),
            isouter=True
        )
        .filter(ShopTraveler.lot_id == lot.id)
        .filter(ShopTravelerStep.status == "completed")
        .scalar()
        or 0
    )

    shipped_qty = (
        db.query(func.coalesce(func.sum(CustomerShipmentItem.qty), 0))
        .filter(CustomerShipmentItem.lot_id == lot.id)
        .scalar()
        or 0
    )

    available_qty = float(finished_qty) - float(shipped_qty)

    # ✅ ตรวจสอบว่ามี stock พอไหม
    if qty > available_qty:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot allocate {qty} pcs — only {available_qty} available",
        )

    # ✅ ถ้าพอ → ทำงานต่อ
    shipment = get_or_create_shipment(db, lot)
    new_item = CustomerShipmentItem(
        shipment_id=shipment.id,
        po_line_id=lot.po_line_id or 0,  # fallback
        lot_id=lot.id,
        qty=qty,
    )
    db.add(new_item)
    db.commit()
    db.refresh(new_item)

    return {"status": "ok", "allocated_qty": qty, "available_after": available_qty - qty}

@router.post("/return-part")
def return_part(req: PartQtyRequest, db: Session = Depends(get_db)):
    if req.qty <= 0:
        raise HTTPException(status_code=400, detail="Quantity must be > 0")

    _ = get_lot_or_404(db, req.lot_id)

    remain = req.qty
    total_returned = 0.0

    items = (
        db.query(CustomerShipmentItem)
        .filter(CustomerShipmentItem.lot_id == req.lot_id)
        .order_by(CustomerShipmentItem.id.desc())
        .all()
    )

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

    return {"status": "returned", "returned_qty": total_returned, "remain": remain}


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
# 4️⃣  Shipment history for a lot
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
# 5️⃣  Header info (reuse from lot)
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

    part, planned, shipped, available = get_part_inventory_data(db, lot.id)

    return {
        "lot_id": lot.id,
        "lot_no": lot.lot_no,
        "part_no": part.part_no if part else None,
        "planned_qty": planned,
        "shipped_qty": shipped,
        "available_qty": available,
        "status": lot.status,
        "due_date": lot.lot_due_date,
    }


# ============================================================
# 6️⃣  Get part inventory for a lot
# ============================================================
@router.get("/lot/{lot_id}/part-inventory")
def get_part_inventory(lot_id: int, db: Session = Depends(get_db)):
    from models import (
        Part,
        ProductionLot,
        ShopTraveler,
        ShopTravelerStep,
        CustomerShipmentItem,
    )

    # 🔹 ตรวจสอบ lot และ part
    lot = db.get(ProductionLot, lot_id)
    if not lot:
        raise HTTPException(status_code=404, detail="Lot not found")
    part = db.get(Part, lot.part_id)
    if not part:
        raise HTTPException(status_code=404, detail="Part not found")

    # 🔹 หา step ล่าสุดของแต่ละ traveler (โดย group traveler_id)
    sub_max_seq = (
        db.query(
            ShopTravelerStep.traveler_id,
            func.max(ShopTravelerStep.seq).label("max_seq")
        )
        .group_by(ShopTravelerStep.traveler_id)
        .subquery()
    )

    # 🔹 รวม qty_accept จาก step สุดท้ายของทุก traveler (ที่ผ่าน)
    finished_qty = (
        db.query(func.coalesce(func.sum(ShopTravelerStep.qty_accept), 0))
        .join(
            sub_max_seq,
            (ShopTravelerStep.traveler_id == sub_max_seq.c.traveler_id)
            & (ShopTravelerStep.seq == sub_max_seq.c.max_seq)
        )
        .join(ShopTraveler, ShopTraveler.id == ShopTravelerStep.traveler_id)
        .filter(ShopTraveler.lot_id == lot.id)
        .filter(ShopTravelerStep.status.in_(["passed", "completed"]))
        .scalar()
        or 0
    )

    # 🔹 รวม shipment
    shipped_qty = (
        db.query(func.coalesce(func.sum(CustomerShipmentItem.qty), 0))
        .filter(CustomerShipmentItem.lot_id == lot_id)
        .scalar()
        or 0
    )

    # 🔹 แปลงเป็น float ป้องกัน Decimal error
    planned_qty = float(lot.planned_qty or 0)
    finished_qty = float(finished_qty or 0)
    shipped_qty = float(shipped_qty or 0)

    available_qty = max(finished_qty - shipped_qty, 0)
    progress_percent = round(finished_qty / planned_qty * 100, 2) if planned_qty > 0 else 0

    return {
        "part_id": part.id,
        "part_no": part.part_no,
        "lot_id": lot_id,
        "planned_qty": planned_qty,
        "finished_qty": finished_qty,
        "shipped_qty": shipped_qty,
        "available_qty": available_qty,
        "progress_percent": progress_percent,
        "uom": getattr(part, "uom", "pcs"),
    }

# @router.get("/lot/{lot_id}/part-inventory")
# def get_part_inventory(lot_id: int, db: Session = Depends(get_db)):
#     from models import Part, ProductionLot, ShopTraveler, ShopTravelerStep, CustomerShipmentItem

#     lot = db.get(ProductionLot, lot_id)
#     if not lot:
#         raise HTTPException(status_code=404, detail="Lot not found")

#     part = db.get(Part, lot.part_id)
#     if not part:
#         raise HTTPException(status_code=404, detail="Part not found")

#     # ✅ หาค่า accept จาก step สุดท้ายของแต่ละ traveler
#     sub_max_seq = (
#         db.query(
#             ShopTravelerStep.traveler_id,
#             func.max(ShopTravelerStep.seq).label("max_seq")
#         )
#         .group_by(ShopTravelerStep.traveler_id)
#         .subquery()
#     )

#     # ✅ รวม qty_accept ของ step สุดท้าย (เฉพาะ traveler ของ lot นี้)
#     finished_qty = (
#         db.query(func.coalesce(func.sum(ShopTravelerStep.qty_accept), 0))
#         .join(sub_max_seq,
#               (ShopTravelerStep.traveler_id == sub_max_seq.c.traveler_id) &
#               (ShopTravelerStep.seq == sub_max_seq.c.max_seq))
#         .join(ShopTraveler, ShopTraveler.id == ShopTravelerStep.traveler_id)
#         .filter(ShopTraveler.lot_id == lot.id)
#         .scalar()
#         or 0
#     )

#     # ✅ รวม qty ที่ shipment ไปแล้ว
#     shipped_qty = (
#         db.query(func.coalesce(func.sum(CustomerShipmentItem.qty), 0))
#         .filter(CustomerShipmentItem.lot_id == lot_id)
#         .scalar()
#         or 0
#     )

#     available_qty = float(finished_qty) - float(shipped_qty)
#     if available_qty < 0:
#         available_qty = 0

#     return {
#         "part_id": part.id,
#         "part_no": part.part_no,
#         "lot_id": lot_id,
#         "planned_qty": float(lot.planned_qty or 0),
#         "finished_qty": float(finished_qty),
#         "shipped_qty": float(shipped_qty),
#         "available_qty": float(available_qty),
#         "uom": getattr(part, "uom", "pcs"),
#     }


from fastapi import Body

@router.patch("/{shipment_id}/status")
def update_shipment_status(shipment_id: int, data: dict = Body(...), db: Session = Depends(get_db)):
    s = db.get(CustomerShipment, shipment_id)
    if not s:
        raise HTTPException(status_code=404, detail="Shipment not found")

    new_status = data.get("status")
    if new_status not in ["pending", "shipped", "cancelled"]:
        raise HTTPException(status_code=400, detail="Invalid status")

    s.status = new_status
    db.commit()
    return {"status": "ok", "shipment_id": s.id, "new_status": s.status}
