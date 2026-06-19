# routers/v1/part_inventory.py

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func

from database import get_db
from models import (
    Inventory,
    ProductionLot,
    Part,
    PartRevision,
)

router = APIRouter(
    prefix="/part_inventory",
    tags=["part_inventory"]
)


@router.get("")
def get_part_inventory(
    q: str | None = Query(None),
    db: Session = Depends(get_db)
):

    rows = (
        db.query(
            Inventory.id,

            Part.id.label("part_id"),
            Part.part_no.label("part_no"),

            PartRevision.id.label("part_revision_id"),
            PartRevision.rev.label("rev"),

            ProductionLot.id.label("lot_id"),
            ProductionLot.lot_no.label("lot_no"),

            Inventory.prod_qty,
            Inventory.ship_qty,
            Inventory.stock_qty,

            func.sum(
                Inventory.stock_qty
            )
            .over(
                partition_by=(
                    Part.id,
                    PartRevision.id
                )
            )
            .label("part_rev_total_qty")
        )
        .join(
            ProductionLot,
            ProductionLot.id == Inventory.lot_id
        )
        .join(
            Part,
            Part.id == ProductionLot.part_id
        )
        .outerjoin(
            PartRevision,
            PartRevision.id == ProductionLot.part_revision_id
        )
    )

    if q:
        rows = rows.filter(
            (Part.part_no.ilike(f"%{q}%"))
            |
            (ProductionLot.lot_no.ilike(f"%{q}%"))
            |
            (PartRevision.rev.ilike(f"%{q}%"))
        )

    rows = rows.order_by(
        Part.part_no,
        PartRevision.rev,
        ProductionLot.lot_no
    )

    return [
        {
            "id": r.id,

            "part_id": r.part_id,
            "part_no": r.part_no,

            "part_revision_id": r.part_revision_id,
            "rev": r.rev,

            "lot_id": r.lot_id,
            "lot_no": r.lot_no,

            "prod_qty": r.prod_qty,
            "ship_qty": r.ship_qty,
            "stock_qty": r.stock_qty,

            "part_rev_total_qty": r.part_rev_total_qty
        }
        for r in rows.all()
    ]