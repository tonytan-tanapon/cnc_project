from decimal import Decimal

from sqlalchemy.orm import Session
from sqlalchemy import func

from models import (
    Inventory,
    ProductionLot,
    CustomerShipmentItem,
)


def rebuild_inventory(db: Session, lot_id: int):
    print("REBUILD INVENTORY for lot_id:", lot_id)
    lot = db.get(ProductionLot, lot_id)

    if not lot:
        return None

    inv = (
        db.query(Inventory)
        .filter(Inventory.lot_id == lot_id)
        .first()
    )

    print("REBUILD INVENTORY for lot_id:", lot_id, "lot:", lot, "inv:", inv)
    if inv is None:
        inv = Inventory(
            lot_id=lot_id,
            qty_produced=Decimal("0"),
            qty_shipped=Decimal("0"),
            qty_scrap=Decimal("0"),
            qty_adjust=Decimal("0"),
            qty_on_hand=Decimal("0"),
        )
        db.add(inv)
         
    print("REBUILD INVENTORY for lot_id:", lot_id, "lot:", lot, "inv:", inv)
    # ผลิต
    inv.qty_produced = lot.completed_qty or 0

    # ส่งของ
    shipped = (
        db.query(func.coalesce(func.sum(CustomerShipmentItem.qty), 0))
        .filter(CustomerShipmentItem.lot_id == lot_id)
        .scalar()
    )

    inv.qty_shipped = shipped

    # คำนวณคงเหลือ
    inv.qty_on_hand = (
        inv.qty_produced
        - inv.qty_shipped
        - inv.qty_scrap
        + inv.qty_adjust
    )

    db.commit()
    db.refresh(inv)

    return inv