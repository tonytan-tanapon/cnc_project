# routers/payroll.py
from datetime import date, timedelta
from datetime import datetime
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

from database import get_db
from models import User
from deps.auth import get_current_user 
from deps.authz import require_perm ## authz 

from models import PayPeriod
from schemas import PayPeriodCreate, PayPeriodUpdate, PayPeriodOut

router = APIRouter(
    prefix="/payroll",
    tags=["payroll"],
    # dependencies=[Depends(require_perm("PAYROLL_VIEW"))],  ## authz
)
# CREATE
@router.post("", response_model=PayPeriodOut)
def create_pay_period(payload: PayPeriodCreate, db: Session = Depends(get_db)):
    if payload.end_at <= payload.start_at:
        raise HTTPException(400, "end_at must be greater than start_at")

    existing = (
        db.query(PayPeriod)
        .filter(PayPeriod.start_at == payload.start_at,
                PayPeriod.end_at == payload.end_at)
        .first()
    )
    if existing:
        raise HTTPException(400, "PayPeriod already exists for this range")

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

    if payload.start_at and payload.end_at and payload.end_at <= payload.start_at:
        raise HTTPException(400, "end_at must be greater than start_at")

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