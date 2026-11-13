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

def recalc_inventory(db: Session, inv: Inventory, lot: ProductionLot):
    zero = Decimal("0")

    # Lot ลูกใช้ชิ้นงานเพื่อส่งต่อ ตามกติกาเดียวกับ Traveler Detail
    if (lot.from_lot or "").strip():
        inv.qty_on_hand = zero
        return

    used_by_other_lots = (
        db.query(func.coalesce(func.sum(ProductionLot.from_lot_qty), 0))
        .filter(
            func.trim(ProductionLot.from_lot) == lot.lot_no.strip(),
            ProductionLot.id != lot.id,
        )
        .scalar()
    )

    inv.qty_on_hand = (
        (inv.qty_produced or zero)
        - (inv.qty_shipped or zero)
        - Decimal(str(used_by_other_lots or 0))
        - (inv.qty_scrap or zero)
        + (inv.qty_adjust or zero)
    )
    
# @router.get("")
# def get_inventory(
#     db: Session = Depends(get_db),
# ):

#     from sqlalchemy.orm import joinedload

#     rows = (
#         db.query(Inventory)
#         .options(
#             joinedload(Inventory.lot)
#                 .joinedload(ProductionLot.part),

#             joinedload(Inventory.lot)
#                 .joinedload(ProductionLot.part_revision),
#         )
#         .all()
#     )

   

#     return [
#         inventory_to_dict(inv)
#         for inv in rows
#     ]

@router.get("")
def get_inventory(db: Session = Depends(get_db)):
    from sqlalchemy.orm import joinedload, selectinload

    from models import ShopTraveler, ShopTravelerStep
    from services.lot_service import calculate_final_qty

    rows = (
        db.query(Inventory)
        .options(
            joinedload(Inventory.lot).joinedload(ProductionLot.part),
            joinedload(Inventory.lot).joinedload(ProductionLot.part_revision),
        )
        .all()
    )

    latest_traveler_ids = (
        db.query(func.max(ShopTraveler.id).label("traveler_id"))
        .filter(ShopTraveler.lot_id.in_([inv.lot_id for inv in rows]))
        .group_by(ShopTraveler.lot_id)
        .subquery()
    )

    travelers_by_lot = {
        traveler.lot_id: traveler
        for traveler in (
            db.query(ShopTraveler)
            .join(
                latest_traveler_ids,
                latest_traveler_ids.c.traveler_id == ShopTraveler.id,
            )
            .options(
                selectinload(ShopTraveler.steps)
                .selectinload(ShopTravelerStep.logs)
            )
            .all()
        )
    }

    source_lot_no = func.trim(ProductionLot.from_lot)
    used_by_source = dict(
        db.query(source_lot_no, func.sum(ProductionLot.from_lot_qty))
        .filter(
            source_lot_no != "",
            source_lot_no != func.trim(ProductionLot.lot_no),
        )
        .group_by(source_lot_no)
        .all()
    )
    shipped_by_lot = dict(
        db.query(CustomerShipmentItem.lot_id, func.sum(CustomerShipmentItem.qty))
        .group_by(CustomerShipmentItem.lot_id)
        .all()
    )
    result = []

    for inv in rows:
        lot = inv.lot
        traveler = travelers_by_lot.get(inv.lot_id)
        qty_start = None
        qty_final = None

        if (lot.from_lot or "").strip():
            qty_start = 0
            qty_final = 0
        elif traveler:
            qty_start = sum(
                log.qty_accept or 0
                for step in traveler.steps
                if (step.step_code or "").upper().startswith("M")
                for log in step.logs
            )
            qty_final = calculate_final_qty(traveler) or 0


        used_qty = Decimal(str(used_by_source.get(lot.lot_no.strip()) or 0))
        shipped_qty = Decimal(str(shipped_by_lot.get(lot.id) or 0))

        # ถ้ามี Traveler ใช้ Final QTY แม้ค่าเป็น 0
        produced_qty = Decimal(str(
            qty_final if qty_final is not None else (inv.qty_produced or 0)
        ))

        on_hand_qty = (
            Decimal("0")
            if (lot.from_lot or "").strip()
            else (
                produced_qty
                - shipped_qty
                - used_qty
                - Decimal(str(inv.qty_scrap or 0))
                + Decimal(str(inv.qty_adjust or 0))
            )
        )
        result.append({
            **inventory_to_dict(inv),
            "qty_on_hand": float(on_hand_qty),
            "qty_start": float(qty_start) if qty_start is not None else None,
            "qty_final": float(qty_final) if qty_final is not None else None,
            "from_lot": lot.from_lot,
            "from_lot_qty": (
                float(lot.from_lot_qty)
                if lot.from_lot_qty is not None
                else None
            ),
            "used_by_other_lots": float(used_qty),
        })

    return result


from sqlalchemy.orm import joinedload
@router.post("/adjust")
def adjust_inventory(
    data: InventoryAdjust,
    db: Session = Depends(get_db)
):
    inv = (
        db.query(Inventory)
        .filter(Inventory.lot_id == data.lot_id)
        .first()
    )

    if not inv:
        raise HTTPException(
            status_code=404,
            detail="Inventory not found"
        )

    qty_changed = data.qty is not None

    if qty_changed:
        inv.qty_adjust = Decimal(str(data.qty))
        inv.inventory_status = "checked"
        recalc_inventory(db, inv, inv.lot)

    if data.note is not None:
        inv.note = data.note

    if data.status is not None:
        inv.inventory_status = data.status

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


def get_inventory_produced_qty(db: Session, lot: ProductionLot) -> Decimal:
    from models import ShopTraveler
    from services.lot_service import calculate_final_qty

    if (lot.from_lot or "").strip():
        return Decimal("0")

    traveler = (
        db.query(ShopTraveler)
        .filter(ShopTraveler.lot_id == lot.id)
        .order_by(ShopTraveler.id.desc())
        .first()
    )

    if traveler is None:
        return Decimal(str(lot.planned_qty or 0))

    return Decimal(str(calculate_final_qty(traveler) or 0))
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
        inv.qty_produced = get_inventory_produced_qty(db, lot)

        # Shipment
        shipped = ship_map.get(lot.id, 0)
        inv.qty_shipped = Decimal(str(shipped or 0))
        recalc_inventory(db, inv, lot)
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
    inv.qty_produced = get_inventory_produced_qty(db, lot)

    # ส่งออก
    shipped = (
        db.query(
            func.coalesce(func.sum(CustomerShipmentItem.qty), 0)
        )
        .filter(CustomerShipmentItem.lot_id == lot_id)
        .scalar()
    )

    inv.qty_shipped = Decimal(str(shipped or 0))

    recalc_inventory(db, inv, lot)

    db.commit()
    db.refresh(inv)

    return inventory_to_dict(inv)

