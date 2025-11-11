# routers/lookups.py
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_, func
from pydantic import BaseModel
from typing import List
from database import get_db
from models import ManufacturingProcess, ChemicalFinish, RawMaterial  # <-- add RawMaterial

lookups = APIRouter(prefix="/lookups", tags=["lookups"])

class Row(BaseModel):
    id: int
    code: str | None = None
    name: str

class Out(BaseModel):
    items: List[Row]

@lookups.get("/processes", response_model=Out)
def list_processes(db: Session = Depends(get_db)):
    rows = (
        db.query(ManufacturingProcess)
        .filter(ManufacturingProcess.is_active == True)
        .order_by(ManufacturingProcess.name)
        .all()
    )
   
    return {"items": [Row(id=r.id, code=r.code, name=r.name) for r in rows]}

@lookups.get("/finishes", response_model=Out)
def list_finishes(db: Session = Depends(get_db)):
    rows = (
        db.query(ChemicalFinish)
        .filter(ChemicalFinish.is_active == True)
        .order_by(ChemicalFinish.name)
        .all()
    )
    return {"items": [Row(id=r.id, code=r.code, name=r.name) for r in rows]}

# NEW: /lookups/materials — search by code or name
@lookups.get("/materials", response_model=Out)
def list_materials(
    q: str = Query("", description="Search by material code or name (ILIKE)"),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    qry = db.query(RawMaterial)

    if q:
        like = f"%{q.strip()}%"
        qry = qry.filter(or_(
            RawMaterial.code.ilike(like),
            RawMaterial.name.ilike(like),
        ))

    # Sort by code then name (case-insensitive)
    rows = (
        qry.order_by(func.lower(RawMaterial.code).asc(), func.lower(RawMaterial.name).asc())
           .limit(limit)
           .all()
    )

    return {"items": [Row(id=r.id, code=r.code, name=r.name) for r in rows]}
