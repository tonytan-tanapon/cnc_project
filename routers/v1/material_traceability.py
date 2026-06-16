from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_

from database import get_db

from models import (
ProductionLot,
LotMaterialUse,
RawBatch,
RawMaterial,
Supplier,
Part,
)

router = APIRouter(
prefix="/material-traceability",
tags=["material-traceability"]
)

@router.get("")
def get_material_traceability(
q: str | None = Query(None),
db: Session = Depends(get_db)
):
    rows = (
        db.query(
            LotMaterialUse.id.label("lot_material_use_id"),
            RawBatch.id.label("batch_id"),
            ProductionLot.id.label("lot_id"),
            ProductionLot.lot_no.label("lot_no"),

            Part.part_no.label("part_no"),

            RawBatch.mat_po.label("mat_po"),
            RawBatch.cutting_note.label("cutting_note"),
            RawBatch.po_note.label("po_note"),

            Supplier.name.label("supplier_name"),

            RawMaterial.type.label("material_type"),
            RawMaterial.spec.label("material_spec"),

            RawBatch.heat_lot.label("heat_lot"),
            RawBatch.size_text.label("size_text"),
            RawBatch.length_text.label("length_text"),

            RawBatch.batch_no.label("batch_no"),
        )

        .join(
            LotMaterialUse,
            LotMaterialUse.lot_id == ProductionLot.id
        )

        .join(
            RawBatch,
            RawBatch.id == LotMaterialUse.batch_id
        )

        .join(
            RawMaterial,
            RawMaterial.id == RawBatch.material_id
        )

        .outerjoin(
            Supplier,
            Supplier.id == RawBatch.supplier_id
        )

        .join(
            Part,
            Part.id == ProductionLot.part_id
        )
    )

    if q:

        search = f"%{q}%"

        rows = rows.filter(
            or_(
                ProductionLot.lot_no.ilike(search),

                Part.part_no.ilike(search),

                RawBatch.batch_no.ilike(search),
                RawBatch.heat_lot.ilike(search),
                RawBatch.mat_po.ilike(search),

                RawBatch.size_text.ilike(search),
                RawBatch.length_text.ilike(search),

                RawBatch.cutting_note.ilike(search),
                RawBatch.po_note.ilike(search),

                Supplier.name.ilike(search),

                RawMaterial.type.ilike(search),
                RawMaterial.spec.ilike(search),
            )
        )

    rows = (
        rows
        .order_by(
            ProductionLot.id.desc()
        )
        .all()
    )

    return [
        dict(r._mapping)
        for r in rows
    ]

from datetime import date
from pydantic import BaseModel
from fastapi import HTTPException

class ProductionLotUpdate(BaseModel):
    lot_no: str | None = None
    planned_qty: float | None = None
    planned_ship_qty: float | None = None
    lot_due_date: date | None = None
    note: str | None = None
    fair_note: str | None = None


@router.put("/production-lots/{lot_id}")
def update_lot(
    lot_id: int,
    payload: ProductionLotUpdate,
    db: Session = Depends(get_db)
):
    
    print("UPDATE LOT")
    print("LOT ID =", lot_id)
    print("PAYLOAD =", payload)
    lot = db.get(ProductionLot, lot_id)

    if not lot:
        raise HTTPException(
            status_code=404,
            detail="Lot not found"
        )

    data = payload.model_dump(exclude_unset=True)

    for key, value in data.items():
        setattr(lot, key, value)

    db.commit()
    db.refresh(lot)

    return {
        "ok": True,
        "lot_id": lot.id
    }

from pydantic import BaseModel

class LotMaterialUseUpdate(BaseModel):
    batch_id: int

@router.put("/lot-material-use/{id}")
def update_lot_material_use(
    id: int,
    payload: LotMaterialUseUpdate,
    db: Session = Depends(get_db)
):
    row = db.get(LotMaterialUse, id)

    if not row:
        raise HTTPException(
            status_code=404,
            detail="LotMaterialUse not found"
        )

    batch = db.get(
        RawBatch,
        payload.batch_id
    )

    row.batch_id = payload.batch_id
    row.raw_material_id = batch.material_id

    db.commit()

    return {"ok": True}


@router.get("/batch-options")
def get_batch_options(
    db: Session = Depends(get_db)
):
    rows = (
        db.query(
            RawBatch.id,
            RawBatch.batch_no,
            RawBatch.heat_lot,

            RawMaterial.type,
            RawMaterial.spec,
        )

        .join(
            RawMaterial,
            RawMaterial.id == RawBatch.material_id
        )

        .order_by(
            RawBatch.batch_no
        )

        .all()
    )

    return [
        {
            "value": r.id,

            "label":
                f"{r.batch_no}"
                f" | {r.type or ''}"
                f" | {r.spec or ''}"
        }
        for r in rows
    ]

class MaterialTraceabilityCreate(
    BaseModel
):
    lot_id: int
    batch_id: int
    qty: float = 0


@router.post("")
def create_material_traceability(
    payload: MaterialTraceabilityCreate,
    db: Session = Depends(get_db)
):

    batch = db.get(
        RawBatch,
        payload.batch_id
    )

    row = LotMaterialUse(
        lot_id=payload.lot_id,
        batch_id=payload.batch_id,
        raw_material_id=batch.material_id,
        qty=payload.qty,
    )

    db.add(row)
    db.commit()
    db.refresh(row)

    return {
        "ok": True
    }

@router.get("/lot-options")
def get_lot_options(
    db: Session = Depends(get_db)
):
    rows = (
        db.query(
            ProductionLot.id,
            ProductionLot.lot_no,
        )
        .order_by(
            ProductionLot.lot_no
        )
        .all()
    )

    return [
        {
            "value": r.id,
            "label": r.lot_no
        }
        for r in rows
    ]

@router.delete("/lot-material-use/{id}")
def delete_lot_material_use(
    id: int,
    db: Session = Depends(get_db)
):
    row = db.get(
        LotMaterialUse,
        id
    )

    if not row:
        raise HTTPException(
            status_code=404,
            detail="LotMaterialUse not found"
        )

    db.delete(row)
    db.commit()

    return {
        "ok": True
    }