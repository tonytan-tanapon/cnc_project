# routers/machines.py
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from pydantic import BaseModel, ConfigDict

from database import get_db
from models import Machine   # ✅ ONLY THIS
# ❌ remove: from schemas import Machine

router = APIRouter(prefix="/machines", tags=["machines"])


# =======================
# SCHEMA
# =======================
class MachineOut(BaseModel):
    id: int
    code: str  | None = None 
    name: str | None = None

    model_config = ConfigDict(from_attributes=True)


# =======================
# GET
# =======================
@router.get("", response_model=List[MachineOut])
def get_machines(db: Session = Depends(get_db)):
    machines = db.query(Machine).all()

    return [
        {
            "id": m.id,
            "code": m.code,
            "name": m.name
        }
        for m in machines
    ]

@router.get("/{machine_id}", response_model=MachineOut)
def get_machine_by_id(machine_id: int, db: Session = Depends(get_db)):
    machine = db.get(Machine, machine_id)
    if not machine:
        raise HTTPException(status_code=404, detail="Machine not found")
    return machine

# /api/v1/machines/by_code/{code}
@router.get("/by_code/{code}", response_model=MachineOut)
def get_machine_by_code(code: str, db: Session = Depends(get_db)):
    machine = db.query(Machine).filter(Machine.code == code).first()
    if not machine:
        raise HTTPException(status_code=404, detail="Machine not found")
    return machine