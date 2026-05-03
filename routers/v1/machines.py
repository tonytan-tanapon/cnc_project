# routers/machines.py
from fastapi import APIRouter, Depends
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