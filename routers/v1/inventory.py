# routers/v1/inventory.py

from fastapi import APIRouter, Depends,HTTPException
from sqlalchemy.orm import Session
from database import get_db  # or your session dependency
from models import Part, RawMaterial, RawBatch, LotMaterialUse,Inventory

from models import (
    Inventory,
    ProductionLot,
    CustomerShipmentItem,
)

from sqlalchemy import func, select
from decimal import Decimal

router = APIRouter(prefix="/inventory", tags=["inventory"])

from pydantic import BaseModel


from typing import Optional
class InventoryAdjust(BaseModel):
    lot_id: int
    qty: Optional[float] = None
    note: Optional[str] = None
    status: Optional[str] = None
    


def inventory_to_dict(inv):

    return {

        "lot_id": inv.lot.id,

        "lot_no": inv.lot.lot_no,

        "part_no": inv.lot.part.part_no,

        "rev": (
            inv.lot.part_revision.rev
            if inv.lot.part_revision
            else ""
        ),

        "qty_produced": float(inv.qty_produced or 0),

        "qty_shipped": float(inv.qty_shipped or 0),

        "qty_scrap": float(inv.qty_scrap or 0),

        "qty_adjust": float(inv.qty_adjust or 0),

        "qty_on_hand": float(inv.qty_on_hand or 0),

        "status": inv.inventory_status,

        "note": inv.note or "",

    }

def recalc_inventory(inv):
    produced = inv.qty_produced or Decimal("0")
    shipped = inv.qty_shipped or Decimal("0")
    scrap = inv.qty_scrap or Decimal("0")
    adjust = inv.qty_adjust or Decimal("0")

    inv.qty_on_hand = (
        produced
        - shipped
        - scrap
        + adjust
    )
    
@router.get("")
def get_inventory(
    db: Session = Depends(get_db),
):

    from sqlalchemy.orm import joinedload

    rows = (
        db.query(Inventory)
        .options(
            joinedload(Inventory.lot)
                .joinedload(ProductionLot.part),

            joinedload(Inventory.lot)
                .joinedload(ProductionLot.part_revision),
        )
        .all()
    )

   

    return [
        inventory_to_dict(inv)
        for inv in rows
    ]


from sqlalchemy.orm import joinedload
@router.post("/adjust")
def adjust_inventory(
    data: InventoryAdjust,
    db: Session = Depends(get_db),
):

    inv = (
        db.query(Inventory)
        .options(
            joinedload(Inventory.lot).joinedload(ProductionLot.part),
            joinedload(Inventory.lot).joinedload(ProductionLot.part_revision),
        )
        .filter(Inventory.lot_id == data.lot_id)
        .first()
    )

    if not inv:
        raise HTTPException(404, "Inventory not found")

    # Replace ค่า Adjust
    inv.qty_adjust = Decimal(str(data.qty))
    inv.note = data.note

    if data.qty is not None:
        inv.qty_adjust = Decimal(str(data.qty))

    if data.note is not None:
        inv.note = data.note

    if data.status is not None:
        inv.inventory_status = data.status

    recalc_inventory(inv)

    # เปลี่ยนสถานะ
    
    db.commit()
    db.refresh(inv)

    return inventory_to_dict(inv)


@router.get("/parts")
def get_parts():
    return [
        {"part_no": "P-1001", "rev": "A", "on_hand": 20, "allocated": 5},
        {"part_no": "P-1002", "rev": "B", "on_hand": 50, "allocated": 10},
    ]

@router.get("/materials")
def get_materials(db: Session = Depends(get_db)):
    qty_available = (
        RawBatch.qty_received - func.coalesce(func.sum(LotMaterialUse.qty), 0)
    )

    stmt = (
        select(
            RawBatch.id.label("id"),
            RawMaterial.code,
            RawMaterial.name,
            RawMaterial.uom,
            RawBatch.batch_no,
            RawBatch.qty_received,
            qty_available.label("qty_available"),
        )
        .join(RawBatch, RawBatch.material_id == RawMaterial.id)
        .outerjoin(LotMaterialUse, LotMaterialUse.batch_id == RawBatch.id)
        .group_by(
            RawBatch.id,
            RawMaterial.code,
            RawMaterial.name,
            RawMaterial.uom,
            RawBatch.batch_no,
            RawBatch.qty_received,
        )
        .having(qty_available > 0)        # ✅ FILTER HERE
        .order_by(RawMaterial.code, RawBatch.batch_no)
    )

    results = db.execute(stmt).all()

    return [
        {
            "id": r.id,
            "code": r.code,
            "name": r.name,
            "batch_no": r.batch_no,
            "qty_received": float(r.qty_received),
            "qty_available": float(r.qty_available),
            "qty_uom": r.uom,
            "status": "OK",
        }
        for r in results
    ]


# @router.post("/part_inventory")
# def create_inventory(
#     data: InventoryCreate,
#     db: Session = Depends(get_db)
# ):

#     part = (
#         db.query(Part)
#         .filter(
#             Part.part_no == data.part_no,
#             Part.rev == data.rev
#         )
#         .first()
#     )

#     if not part:
#         raise HTTPException(
#             400,
#             "Part not found"
#         )

#     inv = Inventory(

#         part_id=part.id,

#         lot_no=data.lot_no,

#         prod_qty=data.prod_qty,
#         ship_qty=data.ship_qty,
#         stock_qty=data.stock_qty

#     )

#     db.add(inv)
#     db.commit()
#     db.refresh(inv)

#     return inv
@router.post("/rebuild")
def rebuild_all_inventory(
    db: Session = Depends(get_db),
):

    lots = db.query(ProductionLot).all()

    total = 0

    inventories = {
        i.lot_id: i
        for i in db.query(Inventory).all()
    }

    ship_map = dict(
        db.query(
            CustomerShipmentItem.lot_id,
            func.sum(CustomerShipmentItem.qty)
        )
        .group_by(CustomerShipmentItem.lot_id)
        .all()
    )

    for lot in lots:

        inv = inventories.get(lot.id)

        if inv is None:
            inv = Inventory(lot_id=lot.id)
            db.add(inv)

        # Produced
        inv.qty_produced = Decimal(str(lot.planned_qty or 0))

        # Shipment
        shipped = ship_map.get(lot.id, 0)

        inv.qty_shipped = Decimal(str(shipped or 0))

        recalc_inventory(inv)

        total += 1

    db.commit()

    return {
        "success": True,
        "total_lots": total
    }



@router.post("/rebuild/{lot_id}")
def rebuild_inventory(
    lot_id: int,
    db: Session = Depends(get_db),
):

    lot = db.get(ProductionLot, lot_id)

    if not lot:
        raise HTTPException(404, "Lot not found")

    inv = (
        db.query(Inventory)
        .filter(Inventory.lot_id == lot_id)
        .first()
    )

    if inv is None:
        inv = Inventory(lot_id=lot_id)
        db.add(inv)

    # ผลิตได้
    inv.qty_produced = Decimal(str(lot.planned_qty or 0))

    # ส่งออก
    shipped = (
        db.query(
            func.coalesce(func.sum(CustomerShipmentItem.qty), 0)
        )
        .filter(CustomerShipmentItem.lot_id == lot_id)
        .scalar()
    )

    inv.qty_shipped = Decimal(str(shipped or 0))

    recalc_inventory(inv)

    db.commit()
    db.refresh(inv)

    return inventory_to_dict(inv)

