# routers/v1/inventory.py
from fastapi import APIRouter
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from database import get_db  # or your session dependency
from models import Part, RawMaterial, RawBatch, LotMaterialUse
from sqlalchemy import func, select

router = APIRouter(prefix="/inventory", tags=["inventory"])

@router.get("/parts")
def get_parts():
    return [
        {"part_no": "P-1001", "rev": "A", "on_hand": 20, "allocated": 5},
        {"part_no": "P-1002", "rev": "B", "on_hand": 50, "allocated": 10},
    ]

@router.get("/materials")
def get_materials(db: Session = Depends(get_db)):
    print("inventory")
    # Query: Material + Batch + Remaining Qty
    stmt = (
        select(
            RawMaterial.code,
            RawMaterial.name,
            RawBatch.batch_no,
            RawBatch.qty_received,
            (RawBatch.qty_received - func.coalesce(func.sum(LotMaterialUse.qty), 0)).label("qty_available"),
        )
        .join(RawBatch, RawBatch.material_id == RawMaterial.id)
        .outerjoin(LotMaterialUse, LotMaterialUse.batch_id == RawBatch.id)
        .group_by(RawMaterial.code, RawMaterial.name, RawBatch.batch_no, RawBatch.qty_received)
        .order_by(RawMaterial.code, RawBatch.batch_no)
    )

    results = db.execute(stmt).all()

    # Convert to dict
    return [
        {
            "code": r.code,
            "name": r.name,
            "batch_no": r.batch_no,
            "qty_available": float(r.qty_available),
            "status": "OK" if r.qty_available > 0 else "Need Reorder",
        }
        for r in results
    ]