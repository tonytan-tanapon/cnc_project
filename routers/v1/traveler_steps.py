# routers/traveler_steps.py
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional

from database import get_db
from models import ShopTravelerStep, ShopTraveler, Employee
from schemas import (
    ShopTravelerStepCreate, ShopTravelerStepUpdate, ShopTravelerStepOut
)

router = APIRouter(prefix="/traveler-steps", tags=["traveler_steps"])


@router.post("", response_model=ShopTravelerStepOut)
def create_traveler_step(payload: ShopTravelerStepCreate, db: Session = Depends(get_db)):
    # ต้องมี traveler
    t = db.get(ShopTraveler, payload.traveler_id)
    if not t:
        raise HTTPException(404, "Traveler not found")

    # operator (ถ้าระบุ) ต้องมีจริง
    if payload.operator_id and not db.get(Employee, payload.operator_id):
        raise HTTPException(404, "Operator not found")

    # กัน seq ซ้ำภายใน traveler เดียวกัน
    dup = (
        db.query(ShopTravelerStep)
        .filter(
            ShopTravelerStep.traveler_id == payload.traveler_id,
            ShopTravelerStep.seq == payload.seq,
        )
        .first()
    )
    if dup:
        raise HTTPException(409, "This seq already exists in traveler")

    s = ShopTravelerStep(
        traveler_id=payload.traveler_id,
        seq=payload.seq,
        step_name=payload.step_name,
        step_code=payload.step_code,
        station=payload.station,
        operator_id=payload.operator_id,
        qa_required=payload.qa_required or False,
        status="pending",
    )
    db.add(s)
    db.commit()
    db.refresh(s)
    return s


@router.get("", response_model=List[ShopTravelerStepOut])
def list_traveler_steps(traveler_id: Optional[int] = None, db: Session = Depends(get_db)):
    q = db.query(ShopTravelerStep)
    if traveler_id:
        q = q.filter(ShopTravelerStep.traveler_id == traveler_id).order_by(ShopTravelerStep.seq.asc())
    else:
        q = q.order_by(ShopTravelerStep.id.desc())
    return q.all()


@router.get("/{step_id}", response_model=ShopTravelerStepOut)
def get_traveler_step(step_id: int, db: Session = Depends(get_db)):
    s = db.get(ShopTravelerStep, step_id)
    if not s:
        raise HTTPException(404, "Step not found")
    return s


@router.put("/{step_id}", response_model=ShopTravelerStepOut)
def update_traveler_step(step_id: int, payload: ShopTravelerStepUpdate, db: Session = Depends(get_db)):
    s = db.get(ShopTravelerStep, step_id)
    if not s:
        raise HTTPException(404, "Step not found")

    data = payload.dict(exclude_unset=True)

    # ถ้ามีการเปลี่ยน seq ต้องไม่ชนภายใน traveler เดียวกัน
    if "seq" in data and data["seq"] is not None and data["seq"] != s.seq:
        dup = (
            db.query(ShopTravelerStep)
            .filter(
                ShopTravelerStep.traveler_id == s.traveler_id,
                ShopTravelerStep.seq == data["seq"],
            )
            .first()
        )
        if dup:
            raise HTTPException(409, "This seq already exists in traveler")

    # เปลี่ยน operator ต้องมีจริง
    if "operator_id" in data and data["operator_id"] is not None:
        if not db.get(Employee, data["operator_id"]):
            raise HTTPException(404, "Operator not found")

    # อัปเดตฟิลด์ที่เหลือ
    for k, v in data.items():
        setattr(s, k, v)

    db.commit()
    db.refresh(s)
    return s


@router.delete("/{step_id}")
def delete_traveler_step(step_id: int, db: Session = Depends(get_db)):
    s = db.get(ShopTravelerStep, step_id)
    if not s:
        raise HTTPException(404, "Step not found")
    db.delete(s)
    db.commit()
    return {"message": "Step deleted"}


# ----- Step actions -----

@router.post("/{step_id}/start", response_model=ShopTravelerStepOut)
def start_step(step_id: int, db: Session = Depends(get_db)):
    s = db.get(ShopTravelerStep, step_id)
    if not s:
        raise HTTPException(404, "Step not found")
    s.status = "running"
    s.started_at = datetime.utcnow()
    db.commit()
    db.refresh(s)
    return s


@router.post("/{step_id}/finish", response_model=ShopTravelerStepOut)
def finish_step(
    step_id: int,
    result: str = "passed",
    qa_result: Optional[str] = None,
    qa_notes: Optional[str] = None,
    db: Session = Depends(get_db),
):
    s = db.get(ShopTravelerStep, step_id)
    if not s:
        raise HTTPException(404, "Step not found")

    if result not in ["passed", "failed", "skipped"]:
        raise HTTPException(400, "result must be passed/failed/skipped")

    s.status = result
    s.finished_at = datetime.utcnow()
    if qa_result is not None:
        s.qa_result = qa_result
    if qa_notes is not None:
        s.qa_notes = qa_notes

    db.commit()
    db.refresh(s)
    return s
