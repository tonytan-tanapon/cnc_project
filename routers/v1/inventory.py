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
