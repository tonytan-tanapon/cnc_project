# routers/time_clock.py
from datetime import datetime
from typing import Optional, List
from fastapi import Path

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import and_, func
from sqlalchemy.orm import Session

from database import get_db
from models import TimeEntry, BreakEntry, Employee, User

# =====================================================================
# Time Clock API (kiosk-friendly: resolve Employee by 4-digit code)
# =====================================================================
timeclock_router = APIRouter(prefix="/time-entries", tags=["time_clock"])
breaks_router = APIRouter(prefix="/breaks", tags=["time_clock"])

# ---------- Helpers ----------
def _emp_by_code(db: Session, code: str) -> Employee:
    emp = db.query(Employee).filter(Employee.emp_code == code).first()
    if not emp:
        raise HTTPException(401, "Invalid code")
    return emp

def _current_open_time_entry(db: Session, emp_id: int) -> Optional[TimeEntry]:
    return (db.query(TimeEntry)
              .filter(TimeEntry.employee_id == emp_id,
                      TimeEntry.status == "open")
              .order_by(TimeEntry.clock_in_at.desc(), TimeEntry.id.desc())
              .first())

def _current_open_break(db: Session, te_id: int) -> Optional[BreakEntry]:
    return (db.query(BreakEntry)
              .filter(BreakEntry.time_entry_id == te_id,
                      BreakEntry.end_at.is_(None))
              .first())

def _serialize_break(b: BreakEntry) -> dict:
    return {
        "id": b.id,
        "time_entry_id": b.time_entry_id,
        "break_type": b.break_type,
        "start_at": b.start_at,
        "end_at": b.end_at,
        "method": b.method,
        "location": b.location,
        "notes": b.notes,
        "is_paid": b.is_paid,
    }

def _serialize_time_entry(te: TimeEntry) -> dict:
    return {
        "id": te.id,
        "employee_id": te.employee_id,
        "work_user_id": te.work_user_id,
        "clock_in_at": te.clock_in_at,
        "clock_out_at": te.clock_out_at,
        "clock_in_method": te.clock_in_method,
        "clock_in_location": te.clock_in_location,
        "clock_out_method": te.clock_out_method,
        "clock_out_location": te.clock_out_location,
        "status": te.status,
        "notes": te.notes,
        "breaks": [_serialize_break(b) for b in getattr(te, "breaks", [])],
    }

# ---------- Helpers ----------
def _ensure_time_range(start: datetime, end: Optional[datetime], label_start="start", label_end="end"):
    if end is not None and end <= start:
        raise HTTPException(400, f"{label_end} must be greater than {label_start}")

def _ensure_break_within_entry(br_start: datetime, br_end: Optional[datetime], te_start: datetime, te_end: Optional[datetime]):
    # ถ้า time entry ยัง open (ไม่มี clock_out_at) อนุญาตเฉพาะ break ที่ไม่มี end หรือ end <= now
    # แต่กรณี backfill เราเช็คแบบปลอดภัย: ถ้ามี te_end ต้องให้ break อยู่ภายใน [te_start, te_end]
    if te_end:
        if br_start < te_start or (br_end and br_end > te_end):
            raise HTTPException(400, "Break must be within the time entry range")

from typing import Annotated
CodeType = Annotated[str, Field(min_length=4, max_length=4, pattern=r'^\d{4}$')]
# Or: CodeType = Annotated[str, StringConstraints(min_length=4, max_length=4, pattern=r'^\d{4}$')]

class CodePayload(BaseModel):
    code: CodeType
# ---------- Payloads (kiosk) ----------
class CodePayload(BaseModel):
    # code: constr(regex=r"^\d{4}$")  # 4-digit kiosk code
    code: Annotated[str, Path(pattern=r'^\d{4}$')]

class StartPayload(CodePayload):
    method: Optional[str] = "web"
    location: Optional[str] = None
    notes: Optional[str] = None

class StopPayload(CodePayload):
    method: Optional[str] = "web"
    location: Optional[str] = None
    notes: Optional[str] = None

class StartBreakPayload(CodePayload):
    break_type: str = "lunch"
    method: Optional[str] = "web"
    location: Optional[str] = None
    is_paid: bool = False
    notes: Optional[str] = None

class StopBreakPayload(CodePayload):
    pass

# ---------- Kiosk-friendly endpoints ----------
@timeclock_router.get("/state/{code}", summary="Get current status via 4-digit code")
def state_by_code( code: Annotated[str, Path(pattern=r'^\d{4}$')],
                  db: Session = Depends(get_db)):
    emp = _emp_by_code(db, code)
    te = _current_open_time_entry(db, emp.id)
    if not te:
        # name from related user if you have it
        user = db.query(User).filter(User.employee_id == emp.id).order_by(User.id.asc()).first()
        return {
            "status": "off",
            "time_entry_id": None,
            "break_id": None,
            "employee_id": emp.id,
            "name": getattr(user, "full_name", None) or getattr(emp, "name", None) or f"Emp {emp.id}"
        }
    br = _current_open_break(db, te.id)
    user = db.query(User).filter(User.employee_id == emp.id).order_by(User.id.asc()).first()
    return {
        "status": "break" if br else "in",
        "time_entry_id": te.id,
        "break_id": br.id if br else None,
        "employee_id": emp.id,
        "name": getattr(user, "full_name", None) or getattr(emp, "name", None) or f"Emp {emp.id}"
    }

# In your auth-free router (code-based kiosk)
@timeclock_router.post("/start")
def start_time_entry(payload: StartPayload, db: Session = Depends(get_db)):
    emp = _emp_by_code(db, payload.code)

    # If already clocked in, just return the existing open entry (idempotent)
    open_te = _current_open_time_entry(db, emp.id)
    if open_te:
        # optionally append note if provided
        if payload.notes:
            open_te.notes = (open_te.notes or "") + f"\n[IN note] {payload.notes}"
            db.commit(); db.refresh(open_te)
        return {
            "id": open_te.id,
            "employee_id": open_te.employee_id,
            "work_user_id": open_te.work_user_id,
            "clock_in_at": open_te.clock_in_at,
            "status": open_te.status,
        }

    pay_user = (db.query(User)
                  .filter(User.employee_id == emp.id)
                  .order_by(User.id.asc())
                  .first())

    te = TimeEntry(
        employee_id=emp.id,
        created_by_user_id=None,
        work_user_id=pay_user.id if pay_user else None,
        clock_in_at=datetime.utcnow(),
        clock_in_method=payload.method or "web",
        clock_in_location=payload.location,
        status="open",
        notes=payload.notes,
    )
    db.add(te); db.commit(); db.refresh(te)
    return {
        "id": te.id,
        "employee_id": te.employee_id,
        "work_user_id": te.work_user_id,
        "clock_in_at": te.clock_in_at,
        "status": te.status,
    }

# New ID-less stop (recommended for kiosk)
@timeclock_router.post("/stop")
def stop_time_entry_no_id(payload: StopPayload, db: Session = Depends(get_db)):
    emp = _emp_by_code(db, payload.code)
    te = _current_open_time_entry(db, emp.id)
    if not te:
        raise HTTPException(400, "No open time entry to stop")

    now = datetime.utcnow()

    # Close any open breaks under this entry
    open_breaks = (db.query(BreakEntry)
                     .filter(and_(BreakEntry.time_entry_id == te.id, BreakEntry.end_at.is_(None)))
                     .all())
    for br in open_breaks:
        br.end_at = now

    te.clock_out_at = now
    te.clock_out_method = payload.method or "web"
    te.clock_out_location = payload.location
    if payload.notes:
        te.notes = (te.notes or "") + f"\n[OUT] {payload.notes}"
    te.status = "closed"

    db.commit(); db.refresh(te)
    return {
        "id": te.id,
        "employee_id": te.employee_id,
        "work_user_id": te.work_user_id,
        "clock_out_at": te.clock_out_at,
        "status": te.status,
        "auto_closed_breaks": [b.id for b in open_breaks],
    }

# Keep the original ID-based stop route if other parts of your app use it
@timeclock_router.post("/{time_entry_id}/stop")
def stop_time_entry_by_id(
    time_entry_id: int,
    payload: StopPayload,  # still allowed to send code to verify ownership
    db: Session = Depends(get_db),
):
    te = db.get(TimeEntry, time_entry_id)
    if not te:
        raise HTTPException(404, "TimeEntry not found")

    # If a code is provided, verify the entry belongs to that employee
    if payload.code:
        emp = _emp_by_code(db, payload.code)
        if te.employee_id != emp.id:
            raise HTTPException(403, "Not your time entry")

    if te.status != "open":
        raise HTTPException(400, "TimeEntry already closed or cancelled")

    now = datetime.utcnow()

    open_breaks = (db.query(BreakEntry)
                     .filter(and_(BreakEntry.time_entry_id == te.id, BreakEntry.end_at.is_(None)))
                     .all())
    for br in open_breaks:
        br.end_at = now

    te.clock_out_at = now
    te.clock_out_method = payload.method or "web"
    te.clock_out_location = payload.location
    if payload.notes:
        te.notes = (te.notes or "") + f"\n[OUT] {payload.notes}"
    te.status = "closed"

    db.commit(); db.refresh(te)
    return {
        "id": te.id,
        "employee_id": te.employee_id,
        "work_user_id": te.work_user_id,
        "clock_out_at": te.clock_out_at,
        "status": te.status,
        "auto_closed_breaks": [b.id for b in open_breaks],
    }

class StartBreakPayload(BaseModel):
    code: str
    break_type: str = "lunch"
    method: Optional[str] = "web"
    location: Optional[str] = None
    is_paid: bool = False
    notes: Optional[str] = None

@breaks_router.post("/start")
def start_break(payload: StartBreakPayload, db: Session = Depends(get_db)):
    emp = _emp_by_code(db, payload.code)
    te = _current_open_time_entry(db, emp.id)
    if not te:
        raise HTTPException(400, "You must be clocked in to start a break")

    # prevent overlapping break
    has_open_break = (db.query(func.count(BreakEntry.id))
                        .filter(and_(BreakEntry.time_entry_id == te.id,
                                     BreakEntry.end_at.is_(None)))
                        .scalar() > 0)
    if has_open_break:
        raise HTTPException(400, "A break is already in progress")

    br = BreakEntry(
        time_entry_id=te.id,
        break_type=payload.break_type or "lunch",
        start_at=datetime.utcnow(),
        end_at=None,
        method=payload.method or "web",
        location=payload.location,
        notes=payload.notes,
        is_paid=bool(payload.is_paid),
    )
    db.add(br); db.commit(); db.refresh(br)
    return { "id": br.id, "time_entry_id": br.time_entry_id, "start_at": br.start_at,
             "break_type": br.break_type, "is_paid": br.is_paid }


# New ID-less stop for current break
@breaks_router.post("/stop")
def stop_break_no_id(payload: StopBreakPayload, db: Session = Depends(get_db)):
    emp = _emp_by_code(db, payload.code)
    te = _current_open_time_entry(db, emp.id)
    if not te:
        raise HTTPException(400, "You must be clocked in to stop a break")

    br = _current_open_break(db, te.id)
    if not br:
        raise HTTPException(400, "No break in progress")

    br.end_at = datetime.utcnow()
    db.commit(); db.refresh(br)
    return {
        "id": br.id,
        "time_entry_id": br.time_entry_id,
        "end_at": br.end_at,
    }

# Keep your manual/backfill + listing endpoints exactly as-is (no auth)
# (paste your existing ManualTimeEntry*, ManualBreak*, list_time_entries, range, get_time_entry, upsert_break here unchanged)

# routers/time_clock.py
@timeclock_router.get("/range", summary="List time entries by range (alias)")
def list_time_entries_range(
    db: Session = Depends(get_db),
    employee_id: Optional[int] = Query(default=None),
    start_at: datetime = Query(..., description="inclusive"),
    end_at: datetime = Query(..., description="exclusive"),
) -> List[dict]:
    q = db.query(TimeEntry).filter(
        TimeEntry.clock_in_at >= start_at,
        TimeEntry.clock_in_at < end_at
    )
    if employee_id is not None:
        q = q.filter(TimeEntry.employee_id == employee_id)
    q = q.order_by(TimeEntry.clock_in_at.asc(), TimeEntry.id.asc())
    rows = q.all()
    return [_serialize_time_entry(te) for te in rows]


# (ออปชัน) กัน break ซ้อนกันใน entry เดียวกัน
def _has_overlapping_break(db: Session, time_entry_id: int, start_at: datetime, end_at: Optional[datetime], exclude_id: Optional[int] = None) -> bool:
    q = db.query(BreakEntry).filter(BreakEntry.time_entry_id == time_entry_id)
    if exclude_id:
        q = q.filter(BreakEntry.id != exclude_id)
    # overlap เงื่อนไข: A.start < B.end และ A.end > B.start (ถ้า end เป็น None ให้ถือว่าไปไกล)
    # เพื่อความง่าย ถ้า end_at เป็น None ใช้เป็น far future
    far = datetime.max
    return db.query(
        q.filter(
            BreakEntry.start_at < (end_at or far),
            (BreakEntry.end_at or far) > start_at
        ).exists()
    ).scalar()

@timeclock_router.get("/{time_entry_id}", summary="Get one time entry")
def get_time_entry(time_entry_id: int, db: Session = Depends(get_db)) -> dict:
    te = db.get(TimeEntry, time_entry_id)
    if not te:
        raise HTTPException(404, "TimeEntry not found")
    return _serialize_time_entry(te)


class UpsertBreakPayload(BaseModel):
    break_type: str = "lunch"
    start_at: datetime | None = None
    end_at: datetime | None = None
    is_paid: bool = False
    method: str | None = "manual"
    location: str | None = None
    notes: str | None = None

@timeclock_router.put("/manual/{time_entry_id}/breaks/upsert", tags=["time_clock"])
def upsert_break(time_entry_id: int, payload: UpsertBreakPayload, db: Session = Depends(get_db)):
    te = db.get(TimeEntry, time_entry_id)
    if not te: raise HTTPException(404, "TimeEntry not found")

    # หา break ประเภทเดียวกัน (เช่น lunch ที่ unpaid)
    br = (db.query(BreakEntry)
            .filter(BreakEntry.time_entry_id==te.id,
                    BreakEntry.break_type==(payload.break_type or "lunch"),
                    BreakEntry.is_paid==bool(payload.is_paid))
            .first())

    # ถ้ากำหนดให้ลบ (เช่นทั้ง start/end เป็น None) — optional
    if payload.start_at is None and payload.end_at is None and br:
        db.delete(br); db.commit()
        return {"status":"deleted"}

    # validate ช่วงเวลาเมื่อมี start
    if payload.start_at:
        _ensure_time_range(payload.start_at, payload.end_at, "start_at", "end_at")
        _ensure_break_within_entry(payload.start_at, payload.end_at, te.clock_in_at, te.clock_out_at)
        if _has_overlapping_break(db, te.id, payload.start_at, payload.end_at, exclude_id=br.id if br else None):
            raise HTTPException(400, "Break overlaps")

    if br:
        # update
        for k, v in payload.dict(exclude_unset=True).items():
            setattr(br, k, v)
    else:
        # create
        if not payload.start_at:
            raise HTTPException(400, "start_at required for new break")
        br = BreakEntry(
            time_entry_id=te.id,
            break_type=payload.break_type or "lunch",
            start_at=payload.start_at,
            end_at=payload.end_at,
            method=payload.method or "manual",
            location=payload.location,
            notes=payload.notes,
            is_paid=bool(payload.is_paid),
        )
        db.add(br)

    db.commit(); db.refresh(br)
    return _serialize_break(br)
