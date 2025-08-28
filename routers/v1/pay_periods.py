# routers/pay_periods.py
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models import PayPeriod
from schemas import PayPeriodCreate, PayPeriodUpdate, PayPeriodOut

router = APIRouter(
    prefix="/pay-periods",
    tags=["pay_periods"],
)


def _overlap_exists(db: Session, start_at: datetime, end_at: datetime, exclude_id: Optional[int] = None) -> bool:
    """
    มีงวดที่ทับซ้อนกับช่วง [start_at, end_at) อยู่หรือไม่
    เงื่อนไขทับซ้อน: A.start < B.end และ A.end > B.start
    """
    q = db.query(PayPeriod).filter(
        PayPeriod.start_at < end_at,
        PayPeriod.end_at > start_at,
    )
    if exclude_id:
        q = q.filter(PayPeriod.id != exclude_id)
    return db.query(q.exists()).scalar()


# CREATE
@router.post("", response_model=PayPeriodOut)
def create_pay_period(payload: PayPeriodCreate, db: Session = Depends(get_db)):
    if payload.end_at <= payload.start_at:
        raise HTTPException(400, "end_at must be greater than start_at")

    # ไม่ให้ซ้ำช่วงเดียวกัน
    exists_same = (
        db.query(PayPeriod)
          .filter(PayPeriod.start_at == payload.start_at,
                  PayPeriod.end_at == payload.end_at)
          .first()
    )
    if exists_same:
        raise HTTPException(400, "PayPeriod already exists for this range")

    # กันช่วงทับซ้อน
    if _overlap_exists(db, payload.start_at, payload.end_at):
        raise HTTPException(400, "PayPeriod overlaps with existing period")

    pp = PayPeriod(
        name=payload.name,
        start_at=payload.start_at,
        end_at=payload.end_at,
        status=payload.status or "open",
        anchor=payload.anchor,
        notes=payload.notes,
    )
    db.add(pp)
    db.commit()
    db.refresh(pp)
    return pp


# LIST
@router.get("", response_model=list[PayPeriodOut])
def list_pay_periods(status: str | None = None, db: Session = Depends(get_db)):
    q = db.query(PayPeriod).order_by(PayPeriod.start_at.desc())
    if status:
        q = q.filter(PayPeriod.status == status)
    return q.all()


# GET ONE
@router.get("/{pp_id}", response_model=PayPeriodOut)
def get_pay_period(pp_id: int, db: Session = Depends(get_db)):
    pp = db.get(PayPeriod, pp_id)
    if not pp:
        raise HTTPException(404, "PayPeriod not found")
    return pp


# UPDATE
@router.patch("/{pp_id}", response_model=PayPeriodOut)
def update_pay_period(pp_id: int, payload: PayPeriodUpdate, db: Session = Depends(get_db)):
    pp = db.get(PayPeriod, pp_id)
    if not pp:
        raise HTTPException(404, "PayPeriod not found")

    # ค่าที่จะใช้จริงหลังอัปเดต (ถ้าไม่ได้ส่งมาก็ใช้ของเดิม)
    new_start = payload.start_at or pp.start_at
    new_end   = payload.end_at   or pp.end_at

    if new_end <= new_start:
        raise HTTPException(400, "end_at must be greater than start_at")

    # กันทับซ้อนกับงวดอื่น
    if _overlap_exists(db, new_start, new_end, exclude_id=pp.id):
        raise HTTPException(400, "Updated period overlaps with another pay period")

    for field, value in payload.dict(exclude_unset=True).items():
        setattr(pp, field, value)

    db.commit()
    db.refresh(pp)
    return pp


# LOCK
@router.post("/{pp_id}/lock", response_model=PayPeriodOut)
def lock_pay_period(pp_id: int, db: Session = Depends(get_db)):
    pp = db.get(PayPeriod, pp_id)
    if not pp:
        raise HTTPException(404, "PayPeriod not found")

    pp.status = "locked"
    pp.locked_at = datetime.utcnow()
    db.commit()
    db.refresh(pp)
    return pp


# UNLOCK
@router.post("/{pp_id}/unlock", response_model=PayPeriodOut)
def unlock_pay_period(pp_id: int, db: Session = Depends(get_db)):
    pp = db.get(PayPeriod, pp_id)
    if not pp:
        raise HTTPException(404, "PayPeriod not found")

    pp.status = "open"
    db.commit()
    db.refresh(pp)
    return pp


# MARK PAID
@router.post("/{pp_id}/mark-paid", response_model=PayPeriodOut)
def mark_paid(pp_id: int, db: Session = Depends(get_db)):
    pp = db.get(PayPeriod, pp_id)
    if not pp:
        raise HTTPException(404, "PayPeriod not found")

    if pp.status != "locked":
        raise HTTPException(400, "PayPeriod must be locked before marking as paid")

    pp.status = "paid"
    pp.paid_at = datetime.utcnow()
    db.commit()
    db.refresh(pp)
    return pp


@router.delete("/{pp_id}")
def delete_pay_period(pp_id: int, db: Session = Depends(get_db)):
    pp = db.get(PayPeriod, pp_id)
    if not pp:
        raise HTTPException(404, "PayPeriod not found")
    db.delete(pp)
    db.commit()
    return {"message": "PayPeriod deleted"}
