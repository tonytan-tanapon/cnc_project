# routers/part_materials.py
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from sqlalchemy import func
from database import get_db
from models import Part, PartMaterial, RawMaterial

router = APIRouter(prefix="/parts", tags=["parts-materials"])

# ---------- Schemas ----------
class PMOut(BaseModel):
    id: int                 # row id in part_materials
    material_id: int        # raw_material_id
    code: str | None = None # RawMaterial.code
    name: str | None = None # RawMaterial.name
    class Config:
        from_attributes = True

class PMListOut(BaseModel):
    items: list[PMOut]

class PMCreateIn(BaseModel):
    material_id: int = Field(gt=0)

# ---------- Helpers ----------
def _get_part_or_404(db: Session, part_id: int) -> Part:
    part = db.query(Part).get(part_id)
    if not part:
        raise HTTPException(404, "Part not found")
    return part

def _get_material_or_404(db: Session, material_id: int) -> RawMaterial:
    mat = db.query(RawMaterial).get(material_id)
    if not mat:
        raise HTTPException(404, "Material not found")
    return mat

# ---------- Endpoints ----------
@router.get("/{part_id}/materials", response_model=PMListOut)
def list_part_materials(part_id: int, db: Session = Depends(get_db)):
    _get_part_or_404(db, part_id)
    rows = (
        db.query(PartMaterial)
        .filter(PartMaterial.part_id == part_id)
        .join(RawMaterial, RawMaterial.id == PartMaterial.raw_material_id)
        .order_by(
            func.lower(RawMaterial.code).asc().nulls_last(),
            func.lower(RawMaterial.name).asc(),
        )
        .all()
    )
    items = [
        PMOut(
            id=r.id,
            material_id=r.raw_material_id,
            code=r.raw_material.code,
            name=r.raw_material.name,
        )
        for r in rows
    ]
    return {"items": items}

@router.post("/{part_id}/materials", response_model=PMOut, status_code=201)
def add_part_material(part_id: int, payload: PMCreateIn, db: Session = Depends(get_db)):
    _get_part_or_404(db, part_id)
    mat = _get_material_or_404(db, payload.material_id)

    # enforce (part_id, material_id) uniqueness
    exists = (
        db.query(PartMaterial)
        .filter(
            PartMaterial.part_id == part_id,
            PartMaterial.raw_material_id == payload.material_id,
        )
        .first()
    )
    if exists:
        # Idempotent: return the existing link
        return PMOut(id=exists.id, material_id=mat.id, code=mat.code, name=mat.name)

    row = PartMaterial(part_id=part_id, raw_material_id=payload.material_id)
    db.add(row)
    db.commit()
    db.refresh(row)

    return PMOut(id=row.id, material_id=mat.id, code=mat.code, name=mat.name)

@router.delete("/{part_id}/materials/{part_material_id}", status_code=204)
def delete_part_material(part_id: int, part_material_id: int, db: Session = Depends(get_db)):
    _get_part_or_404(db, part_id)
    row = (
        db.query(PartMaterial)
        .filter(PartMaterial.id == part_material_id, PartMaterial.part_id == part_id)
        .first()
    )
    if not row:
        raise HTTPException(404, "Part material not found")
    db.delete(row)
    db.commit()
