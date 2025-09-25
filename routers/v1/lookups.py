from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List
from database import get_db
from models import ManufacturingProcess, ChemicalFinish

lookups = APIRouter(prefix="/lookups", tags=["lookups"])

class Row(BaseModel):
  id: int
  code: str | None = None
  name: str

class Out(BaseModel):
  items: List[Row]

@lookups.get("/processes", response_model=Out)
def list_processes(db: Session = Depends(get_db)):
  rows = db.query(ManufacturingProcess)\
           .filter(ManufacturingProcess.is_active == True)\
           .order_by(ManufacturingProcess.name).all()
  return {"items": [Row(id=r.id, code=r.code, name=r.name) for r in rows]}

@lookups.get("/finishes", response_model=Out)
def list_finishes(db: Session = Depends(get_db)):
  rows = db.query(ChemicalFinish)\
           .filter(ChemicalFinish.is_active == True)\
           .order_by(ChemicalFinish.name).all()
  return {"items": [Row(id=r.id, code=r.code, name=r.name) for r in rows]}
