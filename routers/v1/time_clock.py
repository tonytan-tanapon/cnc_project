# routers/time_clock.py
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import and_, func
from sqlalchemy.orm import Session

from database import get_db
from models import TimeEntry, BreakEntry, Employee, User
from deps.auth import get_current_user

# =====================================================================
# Time Clock API (map User -> Employee อัตโนมัติ)
# =====================================================================
timeclock_router = APIRouter(prefix="/time-entries", tags=["time_clock"])

class StartPayload(BaseModel):
    method: Optional[str] = "web"
    location: Optional[str] = None
    notes: Optional[str] = None

class StopPayload(BaseModel):
    method: Optional[str] = None
    location: Optional[str] = None
    notes: Optional[str] = None

@timeclock_router.post("/start")
def start_time_entry(
    payload: StartPayload = StartPayload(),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if not user.employee_id:
        raise HTTPException(400, "User is not linked to an employee")

    # ปิด entry ที่ยัง open (กันเวลาซ้อน)
    open_te = (
        db.query(TimeEntry)
          .filter(TimeEntry.employee_id == user.employee_id,
                  TimeEntry.status == "open")
          .first()
    )
    if open_te:
        open_te.clock_out_at = datetime.utcnow()
        open_te.status = "closed"
        db.flush()

    te = TimeEntry(
        employee_id=user.employee_id,
        created_by_user_id=user.id,
        work_user_id=user.id,              # ✅ account ที่จะรับ payroll
        clock_in_at=datetime.utcnow(),
        clock_in_method=payload.method or "web",
        clock_in_location=payload.location,
        status="open",
        notes=payload.notes,
    )
    db.add(te)
    db.commit()
    db.refresh(te)
    return {
        "id": te.id,
        "employee_id": te.employee_id,
        "work_user_id": te.work_user_id,
        "clock_in_at": te.clock_in_at,
        "status": te.status,
    }

@timeclock_router.post("/{time_entry_id}/stop")
def stop_time_entry(
    time_entry_id: int,
    payload: StopPayload,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    te = db.get(TimeEntry, time_entry_id)
    if not te:
        raise HTTPException(404, "TimeEntry not found")
    if te.employee_id != user.employee_id:
        raise HTTPException(403, "Not your time entry")
    if te.status != "open":
        raise HTTPException(400, "TimeEntry already closed or cancelled")

    now = datetime.utcnow()

    # ปิด break ที่ยังเปิดอยู่ทั้งหมดของ time entry นี้
    open_breaks = (
        db.query(BreakEntry)
          .filter(and_(BreakEntry.time_entry_id == te.id,
                       BreakEntry.end_at.is_(None)))
          .all()
    )
    for br in open_breaks:
        br.end_at = now

    te.clock_out_at = now
    te.clock_out_method = payload.method or "web"
    te.clock_out_location = payload.location
    if payload.notes:
        te.notes = (te.notes or "") + f"\n[OUT] {payload.notes}"
    te.status = "closed"

    db.commit()
    db.refresh(te)
    return {
        "id": te.id,
        "employee_id": te.employee_id,
        "work_user_id": te.work_user_id,
        "clock_out_at": te.clock_out_at,
        "status": te.status,
        "auto_closed_breaks": [b.id for b in open_breaks],
    }

# =====================================================================
# Breaks API (child of time entry)
# =====================================================================
breaks_router = APIRouter(prefix="/breaks", tags=["time_clock"])

class StartBreakPayload(BaseModel):
    time_entry_id: int
    break_type: str = "lunch"
    method: Optional[str] = "web"
    location: Optional[str] = None
    is_paid: bool = False
    notes: Optional[str] = None

@breaks_router.post("/start")
def start_break(
    payload: StartBreakPayload,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    te = db.get(TimeEntry, payload.time_entry_id)
    if not te:
        raise HTTPException(404, "TimeEntry not found")
    if te.employee_id != user.employee_id:
        raise HTTPException(403, "Not your time entry")
    if te.status != "open":
        raise HTTPException(400, "TimeEntry is not open")

    # กันเปิดเบรกซ้อน
    has_open_break = (
        db.query(func.count(BreakEntry.id))
          .filter(and_(BreakEntry.time_entry_id == te.id,
                       BreakEntry.end_at.is_(None)))
          .scalar() > 0
    )
    if has_open_break:
        raise HTTPException(400, "A break is already in progress")

    br = BreakEntry(
        time_entry_id=te.id,
        break_type=payload.break_type or "lunch",
        start_at=datetime.utcnow(),
        end_at=None,
        method=payload.method,
        location=payload.location,
        notes=payload.notes,
        is_paid=bool(payload.is_paid),
    )
    db.add(br)
    db.commit()
    db.refresh(br)
    return {
        "id": br.id,
        "time_entry_id": br.time_entry_id,
        "start_at": br.start_at,
        "break_type": br.break_type,
        "is_paid": br.is_paid,
    }

@breaks_router.post("/{break_id}/stop")
def stop_break(
    break_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    br = db.get(BreakEntry, break_id)
    if not br:
        raise HTTPException(404, "Break not found")

    te = db.get(TimeEntry, br.time_entry_id)
    if not te or te.employee_id != user.employee_id:
        raise HTTPException(403, "Not your time entry")
    if br.end_at is not None:
        raise HTTPException(400, "Break already stopped")

    br.end_at = datetime.utcnow()
    db.commit()
    db.refresh(br)
    return {
        "id": br.id,
        "time_entry_id": br.time_entry_id,
        "end_at": br.end_at,
    }
