# routers/v1/inventory.py

from fastapi import APIRouter, Depends,HTTPException
from sqlalchemy.orm import Session
from database import get_db  # or your session dependency
from models import Part, RawMaterial, RawBatch, LotMaterialUse,Inventory
from sqlalchemy import func, select

router = APIRouter(prefix="/inventory", tags=["inventory"])

from pydantic import BaseModel

class InventoryCreate(BaseModel):

    part_no: str
    rev: str
    lot_no: str

    prod_qty: float = 0
    ship_qty: float = 0
    stock_qty: float = 0


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


@router.post("/part_inventory")
def create_inventory(
    data: InventoryCreate,
    db: Session = Depends(get_db)
):

    part = (
        db.query(Part)
        .filter(
            Part.part_no == data.part_no,
            Part.rev == data.rev
        )
        .first()
    )

    if not part:
        raise HTTPException(
            400,
            "Part not found"
        )

    inv = Inventory(

        part_id=part.id,

        lot_no=data.lot_no,

        prod_qty=data.prod_qty,
        ship_qty=data.ship_qty,
        stock_qty=data.stock_qty

    )

    db.add(inv)
    db.commit()
    db.refresh(inv)

    return inv