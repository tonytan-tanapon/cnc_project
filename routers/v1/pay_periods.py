# routers/pay_periods.py
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import Date
from sqlalchemy.orm import Session

from database import get_db
from models import PayPeriod
from schemas import PayPeriodCreate, PayPeriodUpdate, PayPeriodOut

router = APIRouter(prefix="/pay-periods", tags=["pay_periods"])


# def _overlap_exists(db: Session, start_at: datetime, end_at: datetime, exclude_id: Optional[int] = None) -> bool:
#     q = db.query(PayPeriod).filter(
#         PayPeriod.start_at < end_at,
#         PayPeriod.end_at > start_at,
#     )
#     if exclude_id:
#         q = q.filter(PayPeriod.id != exclude_id)
#     return db.query(q.exists()).scalar()

def _overlap_exists(
    db: Session,
    start_at: datetime,
    end_at: datetime,
    exclude_id: Optional[int] = None
) -> bool:

    q = db.query(PayPeriod).filter(
        PayPeriod.start_at.cast(Date) < end_at.date(),
        PayPeriod.end_at.cast(Date) > start_at.date(),
    )

    if exclude_id:
        q = q.filter(PayPeriod.id != exclude_id)

    return db.query(q.exists()).scalar()

# ---------- Pagination response ----------
class PaginatedPayPeriods(BaseModel):
    items: list[PayPeriodOut]
    total: int
    page: int
    limit: int


# CREATE
@router.post("", response_model=PayPeriodOut)
def create_pay_period(payload: PayPeriodCreate, db: Session = Depends(get_db)):
    if payload.end_at <= payload.start_at:
        raise HTTPException(400, "end_at must be greater than start_at")

    exists_same = (
        db.query(PayPeriod)
        .filter(PayPeriod.start_at == payload.start_at, PayPeriod.end_at == payload.end_at)
        .first()
    )
    if exists_same:
        raise HTTPException(400, "PayPeriod already exists for this range")

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


# LIST (server-side pagination)
@router.get("", response_model=PaginatedPayPeriods)
def list_pay_periods(
    status: Optional[str] = Query(None, description="open/locked/paid"),
    page: int = Query(1, ge=1, description="1-based page number"),
    limit: int = Query(10, ge=1, le=200, description="items per page (max 200)"),
    db: Session = Depends(get_db),
):
    q = db.query(PayPeriod)
    if status:
        q = q.filter(PayPeriod.status == status)

    total = q.count()
    items = (
        q.order_by(PayPeriod.start_at.desc())
        .offset((page - 1) * limit)
        .limit(limit)
        .all()
    )
    return PaginatedPayPeriods(items=items, total=total, page=page, limit=limit)


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

    new_start = payload.start_at or pp.start_at
    new_end = payload.end_at or pp.end_at
    if new_end <= new_start:
        raise HTTPException(400, "end_at must be greater than start_at")

    if _overlap_exists(db, new_start, new_end, exclude_id=pp.id):
        raise HTTPException(400, "Updated period overlaps with another pay period")

    for field, value in payload.dict(exclude_unset=True).items():
        setattr(pp, field, value)

    db.commit()
    db.refresh(pp)
    return pp


# LOCK / UNLOCK / MARK PAID / DELETE
@router.post("/{pp_id}/lock", response_model=PayPeriodOut)
def lock_pay_period(pp_id: int, db: Session = Depends(get_db)):
    pp = db.get(PayPeriod, pp_id)
    if not pp:
        raise HTTPException(404, "PayPeriod not found")
    pp.status = "locked"
    pp.locked_at = datetime.utcnow()
    db.commit(); db.refresh(pp)
    return pp

@router.post("/{pp_id}/unlock", response_model=PayPeriodOut)
def unlock_pay_period(pp_id: int, db: Session = Depends(get_db)):
    pp = db.get(PayPeriod, pp_id)
    if not pp:
        raise HTTPException(404, "PayPeriod not found")
    pp.status = "open"
    db.commit(); db.refresh(pp)
    return pp

@router.post("/{pp_id}/mark-paid", response_model=PayPeriodOut)
def mark_paid(pp_id: int, db: Session = Depends(get_db)):
    pp = db.get(PayPeriod, pp_id)
    if not pp:
        raise HTTPException(404, "PayPeriod not found")
    if pp.status != "locked":
        raise HTTPException(400, "PayPeriod must be locked before marking as paid")
    pp.status = "paid"
    pp.paid_at = datetime.utcnow()
    db.commit(); db.refresh(pp)
    return pp

@router.delete("/{pp_id}")
def delete_pay_period(pp_id: int, db: Session = Depends(get_db)):
    pp = db.get(PayPeriod, pp_id)
    if not pp:
        raise HTTPException(404, "PayPeriod not found")
    db.delete(pp); db.commit()
    return {"message": "PayPeriod deleted"}

