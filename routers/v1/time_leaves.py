from datetime import timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import and_
from sqlalchemy.orm import Session
from pydantic import BaseModel
from datetime import datetime
from decimal import Decimal
from typing import Optional
from zoneinfo import ZoneInfo

from routers.v1 import data

LOCAL_TZ = ZoneInfo("America/Los_Angeles")
from database import get_db
from models import TimeLeave
from schemas import (
    TimeLeaveCreate,
    TimeLeaveUpdate,
    TimeLeaveOut,
)

router = APIRouter(prefix="/leaves", tags=["Time Leaves"])

def calc_hours(start_at, end_at, leave_type):

    if leave_type in ("vacation", "holiday", "sick"):
        return 8.0

    delta = end_at - start_at
    return round(delta.total_seconds() / 3600, 2)
    

def has_overlap(
    db: Session,
    employee_id: int,
    start_at,
    end_at,
    exclude_id: Optional[int] = None,
) -> bool:
    from sqlalchemy import func

    q = db.query(TimeLeave).filter(
        TimeLeave.employee_id == employee_id,
        TimeLeave.start_at < end_at,
        func.coalesce(TimeLeave.end_at, TimeLeave.start_at) > start_at,
    )

    if exclude_id:
        q = q.filter(TimeLeave.id != exclude_id)

    return db.query(q.exists()).scalar()

@router.post("", response_model=TimeLeaveOut)
def create_leave(
    data: TimeLeaveCreate,
    db: Session = Depends(get_db),
):


    # Vacation / Holiday = all day
    if data.leave_type in ("vacation", "holiday", "sick"):

        if has_overlap(
            db,
            data.employee_id,
            data.start_at,
            data.start_at,
        ):
            raise HTTPException(409, "Leave overlaps with existing leave")

        leave = TimeLeave(
            employee_id=data.employee_id,
            leave_type=data.leave_type,
            start_at=data.start_at,
            end_at=None,
            hours=8.0,
            is_paid=data.is_paid,
            status=data.status,
            notes=data.notes,
        )

    else:

        if data.end_at is None:
            raise HTTPException(400, "end_at required")

        if data.end_at <= data.start_at:
            raise HTTPException(400, "end_at must be after start_at")

        hours = calc_hours(
            data.start_at,
            data.end_at,
            data.leave_type,
        )

        leave = TimeLeave(
            employee_id=data.employee_id,
            leave_type=data.leave_type,
            start_at=data.start_at,
            end_at=data.end_at,
            hours=hours,
            is_paid=data.is_paid,
            status=data.status,
            notes=data.notes,
        )

    db.add(leave)
    db.commit()
    db.refresh(leave)
    return leave



from sqlalchemy import asc, desc

@router.get("", response_model=List[TimeLeaveOut])
def list_leaves(
    employee_id: Optional[int] = Query(None),
    status: Optional[str] = Query(None),
    order: str = Query("asc", regex="^(asc|desc)$"),  # 👈 NEW
    db: Session = Depends(get_db),
):
    q = db.query(TimeLeave)

    if employee_id:
        q = q.filter(TimeLeave.employee_id == employee_id)

    if status:
        q = q.filter(TimeLeave.status == status)

    # 👇 ORDER HERE
    if order == "asc":
        q = q.order_by(asc(TimeLeave.start_at))
    else:
        q = q.order_by(desc(TimeLeave.start_at))

    return q.all()



@router.get("/{leave_id}", response_model=TimeLeaveOut)
def get_leave(
    leave_id: int,
    db: Session = Depends(get_db),
):
    leave = db.get(TimeLeave, leave_id)
    if not leave:
        raise HTTPException(404, "Leave not found")
    return leave


@router.put("/{leave_id}", response_model=TimeLeaveOut)
def update_leave(
    leave_id: int,
    data: TimeLeaveUpdate,
    db: Session = Depends(get_db),
):
    print("save")
    leave = db.get(TimeLeave, leave_id)
    if not leave:
        raise HTTPException(404, "Leave not found")

    start_at = data.start_at if data.start_at is not None else leave.start_at

    leave_type = (
        data.leave_type
        if data.leave_type is not None
        else leave.leave_type
    )

    if leave_type in ("vacation", "holiday", "sick"):
        end_at = None
    else:
        end_at = data.end_at if data.end_at is not None else leave.end_at

        if end_at is None:
            raise HTTPException(400, "end_at required")

        if end_at <= start_at:
            raise HTTPException(400, "end_at must be after start_at")
        
    overlap_end = end_at if end_at is not None else start_at
    if has_overlap(
        db,
        leave.employee_id,
        start_at,
        overlap_end,
        exclude_id=leave.id,
    ):
        raise HTTPException(
            status_code=409,
            detail="Leave overlaps with existing leave",
        )

    for field, value in data.dict(exclude_unset=True).items():
        setattr(leave, field, value)

    leave.start_at = start_at

    if leave_type in ("vacation", "holiday", "sick"):
        leave.end_at = None
        leave.hours = 8.0
    else:
        leave.end_at = end_at
        leave.hours = calc_hours(
            start_at,
            end_at,
            leave_type,
        )

    db.commit()
    db.refresh(leave)
    return leave


@router.delete("/{leave_id}")
def delete_leave(
    leave_id: int,
    db: Session = Depends(get_db),
):
    leave = db.get(TimeLeave, leave_id)
    if not leave:
        raise HTTPException(404, "Leave not found")

    db.delete(leave)
    db.commit()
    return {"ok": True}
