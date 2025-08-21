# services/time_clock_service.py
from datetime import datetime
from sqlalchemy.orm import Session
from sqlalchemy import and_
from models import TimeEntry, BreakEntry

def start_time_entry(
    db: Session,
    *,
    employee_id: int,
    actor_user_id: int,     # คนกด (created_by_user_id)
    payroll_user_id: int,   # account ที่รับ payroll (work_user_id)
    method: str = "web",
    location: str | None = None,
    notes: str | None = None,
) -> TimeEntry:
    # ปิด entry ค้าง (กันเวลาซ้อน)
    open_te = (
        db.query(TimeEntry)
          .filter(TimeEntry.employee_id == employee_id,
                  TimeEntry.status == "open")
          .first()
    )
    if open_te:
        open_te.clock_out_at = datetime.utcnow()
        open_te.status = "closed"
        db.flush()

    te = TimeEntry(
        employee_id=employee_id,
        created_by_user_id=actor_user_id,
        work_user_id=payroll_user_id,
        clock_in_at=datetime.utcnow(),
        clock_in_method=method,
        clock_in_location=location,
        status="open",
        notes=notes,
    )
    db.add(te)
    db.commit()
    db.refresh(te)
    return te

def stop_time_entry(
    db: Session,
    *,
    time_entry_id: int,
    actor_user_id: int,      # ใช้ตรวจสิทธิถ้าต้องการ
    method: str = "web",
    location: str | None = None,
    notes: str | None = None,
) -> TimeEntry:
    te = db.get(TimeEntry, time_entry_id)
    if not te:
        raise ValueError("TimeEntry not found")
    if te.status != "open":
        raise ValueError("TimeEntry already closed or cancelled")

    now = datetime.utcnow()

    # ปิด breaks ที่ค้าง
    open_breaks = (
        db.query(BreakEntry)
          .filter(and_(BreakEntry.time_entry_id == te.id,
                       BreakEntry.end_at.is_(None)))
          .all()
    )
    for br in open_breaks:
        br.end_at = now

    te.clock_out_at = now
    te.clock_out_method = method
    te.clock_out_location = location
    if notes:
        te.notes = (te.notes or "") + f"\n[OUT] {notes}"
    te.status = "closed"

    db.commit()
    db.refresh(te)
    return te
