# routers/time_clock.py
from datetime import datetime, timezone
from typing import Optional, List, Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import and_, func
from sqlalchemy.orm import Session, joinedload

from database import get_db
from models import TimeEntry, BreakEntry, Employee, User

# ============================================================
# Routers (declare ONCE)
# ============================================================
timeclock_router = APIRouter(prefix="/time-entries", tags=["time_clock"])
breaks_router    = APIRouter(prefix="/breaks",         tags=["time_clock"])

# ============================================================
# Helpers
# ============================================================
def now_utc() -> datetime:
    return datetime.now(timezone.utc)

def _emp_by_code(db: Session, code: str) -> Employee:
    # Ensure codes match as strings (avoid 0123 vs 123 mismatch)
    emp = db.query(Employee).filter(Employee.emp_code == str(code)).first()
    if not emp:
        raise HTTPException(401, "Invalid code")
    return emp

def _current_open_time_entry(db: Session, emp_id: int) -> Optional[TimeEntry]:
    return (
        db.query(TimeEntry)
          .filter(TimeEntry.employee_id == emp_id, TimeEntry.status == "open")
          .order_by(TimeEntry.clock_in_at.desc(), TimeEntry.id.desc())
          .first()
    )

def _current_open_break(db: Session, te_id: int) -> Optional[BreakEntry]:
    return (
        db.query(BreakEntry)
          .filter(BreakEntry.time_entry_id == te_id, BreakEntry.end_at.is_(None))
          .first()
    )

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
    emp = getattr(te, "employee", None)
    employee_name = getattr(emp, "name", None)
    customer = getattr(emp, "customer", None) if emp is not None else None
    customer_name = getattr(customer, "name", None)

    return {
        "id": te.id,
        "employee_id": te.employee_id,
        "employee_name": employee_name,
        "employee_code": getattr(emp, "emp_code", None),
        "customer_id": getattr(emp, "customer_id", None),
        "customer_name": customer_name,
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

# ============================================================
# Schemas — Kiosk (no auth)
# ============================================================
class CodePayload(BaseModel):
    code: Annotated[str, Field(min_length=4, max_length=4, pattern=r"^\d{4}$")]

class KioskStartPayload(CodePayload):
    method: Optional[str] = "web"
    location: Optional[str] = None
    notes: Optional[str] = None

class KioskStopPayload(CodePayload):
    method: Optional[str] = "web"
    location: Optional[str] = None
    notes: Optional[str] = None

class KioskStartBreakPayload(CodePayload):
    break_type: str = "lunch"
    method: Optional[str] = "web"
    location: Optional[str] = None
    is_paid: bool = False
    notes: Optional[str] = None

class KioskStopBreakPayload(CodePayload):
    pass

# ============================================================
# Schemas — Manual / Backfill (no auth)
# ============================================================
class ManualTimeEntryCreate(BaseModel):
    employee_id: int = Field(..., description="Target employee")
    work_user_id: Optional[int] = None
    clock_in_at: datetime
    clock_in_method: Optional[str] = "manual"
    clock_in_location: Optional[str] = None
    clock_out_at: Optional[datetime] = None
    clock_out_method: Optional[str] = "manual"
    clock_out_location: Optional[str] = None
    status: Optional[str] = "closed"  # closed/open/cancelled
    notes: Optional[str] = None

class ManualTimeEntryUpdate(BaseModel):
    clock_in_at: Optional[datetime] = None
    clock_in_method: Optional[str] = None
    clock_in_location: Optional[str] = None
    clock_out_at: Optional[datetime] = None
    clock_out_method: Optional[str] = None
    clock_out_location: Optional[str] = None
    status: Optional[str] = None
    notes: Optional[str] = None
    work_user_id: Optional[int] = None

class ManualBreakCreate(BaseModel):
    time_entry_id: int
    break_type: Optional[str] = "lunch"
    start_at: datetime
    end_at: Optional[datetime] = None
    method: Optional[str] = "manual"
    location: Optional[str] = None
    notes: Optional[str] = None
    is_paid: bool = False

class ManualBreakUpdate(BaseModel):
    start_at: Optional[datetime] = None
    end_at: Optional[datetime] = None
    method: Optional[str] = None
    location: Optional[str] = None
    notes: Optional[str] = None
    break_type: Optional[str] = None
    is_paid: Optional[bool] = None

# ============================================================
# Manual / Backfill Endpoints (no auth)
# ============================================================
def _ensure_time_range(start: datetime, end: Optional[datetime], label_start="start", label_end="end"):
    if end is not None and end <= start:
        raise HTTPException(400, f"{label_end} must be greater than {label_start}")

def _ensure_break_within_entry(br_start: datetime, br_end: Optional[datetime], te_start: datetime, te_end: Optional[datetime]):
    if te_end:
        if br_start < te_start or (br_end and br_end > te_end):
            raise HTTPException(400, "Break must be within the time entry range")

def _has_overlapping_break(db: Session, time_entry_id: int, start_at: datetime, end_at: Optional[datetime], exclude_id: Optional[int] = None) -> bool:
    q = db.query(BreakEntry).filter(BreakEntry.time_entry_id == time_entry_id)
    if exclude_id:
        q = q.filter(BreakEntry.id != exclude_id)
    far = datetime.max
    return db.query(
        q.filter(BreakEntry.start_at < (end_at or far), (BreakEntry.end_at or far) > start_at).exists()
    ).scalar()

@timeclock_router.post("/manual", summary="(Backfill) Create TimeEntry")
def create_time_entry_manual(payload: ManualTimeEntryCreate, db: Session = Depends(get_db)):
    emp = db.get(Employee, payload.employee_id)
    if not emp:
        raise HTTPException(404, "Employee not found")
    _ensure_time_range(payload.clock_in_at, payload.clock_out_at, "clock_in_at", "clock_out_at")

    te = TimeEntry(
        employee_id=payload.employee_id,
        created_by_user_id=None,
        work_user_id=payload.work_user_id,
        clock_in_at=payload.clock_in_at,
        clock_in_method=payload.clock_in_method or "manual",
        clock_in_location=payload.clock_in_location,
        clock_out_at=payload.clock_out_at,
        clock_out_method=payload.clock_out_method,
        clock_out_location=payload.clock_out_location,
        status=payload.status or ("closed" if payload.clock_out_at else "open"),
        notes=payload.notes,
    )
    db.add(te); db.commit(); db.refresh(te)
    return _serialize_time_entry(te)

@timeclock_router.patch("/manual/{time_entry_id}", summary="(Backfill) Update TimeEntry")
def update_time_entry_manual(time_entry_id: int, payload: ManualTimeEntryUpdate, db: Session = Depends(get_db)):
    te = db.get(TimeEntry, time_entry_id)
    if not te:
        raise HTTPException(404, "TimeEntry not found")

    new_in = payload.clock_in_at or te.clock_in_at
    new_out = payload.clock_out_at if payload.clock_out_at is not None else te.clock_out_at
    _ensure_time_range(new_in, new_out, "clock_in_at", "clock_out_at")

    for k, v in payload.dict(exclude_unset=True).items():
        setattr(te, k, v)

    if te.clock_out_at is None and te.status == "closed":
        te.status = "open"

    db.commit(); db.refresh(te)
    return _serialize_time_entry(te)

@timeclock_router.delete("/manual/{time_entry_id}", summary="(Backfill) Delete TimeEntry")
def delete_time_entry_manual(time_entry_id: int, db: Session = Depends(get_db)):
    te = db.get(TimeEntry, time_entry_id)
    if not te:
        raise HTTPException(404, "TimeEntry not found")
    for br in list(getattr(te, "breaks", [])):
        db.delete(br)
    db.delete(te); db.commit()
    return {"status": "deleted", "id": time_entry_id}

@breaks_router.post("/manual", summary="(Backfill) Create Break")
def create_break_manual(payload: ManualBreakCreate, db: Session = Depends(get_db)):
    te = db.get(TimeEntry, payload.time_entry_id)
    if not te:
        raise HTTPException(404, "TimeEntry not found")
    _ensure_time_range(payload.start_at, payload.end_at, "start_at", "end_at")
    _ensure_break_within_entry(payload.start_at, payload.end_at, te.clock_in_at, te.clock_out_at)
    if _has_overlapping_break(db, te.id, payload.start_at, payload.end_at):
        raise HTTPException(400, "Break overlaps")

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
    db.add(br); db.commit(); db.refresh(br)
    return _serialize_break(br)

@breaks_router.patch("/manual/{break_id}", summary="(Backfill) Update Break")
def update_break_manual(break_id: int, payload: ManualBreakUpdate, db: Session = Depends(get_db)):
    br = db.get(BreakEntry, break_id)
    if not br:
        raise HTTPException(404, "Break not found")
    te = db.get(TimeEntry, br.time_entry_id)
    if not te:
        raise HTTPException(404, "Parent TimeEntry not found")

    new_start = payload.start_at or br.start_at
    new_end   = payload.end_at if payload.end_at is not None else br.end_at
    _ensure_time_range(new_start, new_end, "start_at", "end_at")
    _ensure_break_within_entry(new_start, new_end, te.clock_in_at, te.clock_out_at)
    if _has_overlapping_break(db, te.id, new_start, new_end, exclude_id=br.id):
        raise HTTPException(400, "Break overlaps")

    for k, v in payload.dict(exclude_unset=True).items():
        setattr(br, k, v)

    db.commit(); db.refresh(br)
    return _serialize_break(br)

@breaks_router.delete("/manual/{break_id}", summary="(Backfill) Delete Break")
def delete_break_manual(break_id: int, db: Session = Depends(get_db)):
    br = db.get(BreakEntry, break_id)
    if not br:
        raise HTTPException(404, "Break not found")
    db.delete(br); db.commit()
    return {"status": "deleted", "id": break_id}

@timeclock_router.put("/manual/{time_entry_id}/breaks/upsert", summary="(Backfill) Upsert a break on a TimeEntry")
def upsert_break(time_entry_id: int, payload: ManualBreakCreate, db: Session = Depends(get_db)):
    te = db.get(TimeEntry, time_entry_id)
    if not te:
        raise HTTPException(404, "TimeEntry not found")

    br = (
        db.query(BreakEntry)
          .filter(BreakEntry.time_entry_id == te.id,
                  BreakEntry.break_type == (payload.break_type or "lunch"),
                  BreakEntry.is_paid == bool(payload.is_paid))
          .first()
    )

    if payload.start_at:
        _ensure_time_range(payload.start_at, payload.end_at, "start_at", "end_at")
        _ensure_break_within_entry(payload.start_at, payload.end_at, te.clock_in_at, te.clock_out_at)
        if _has_overlapping_break(db, te.id, payload.start_at, payload.end_at, exclude_id=br.id if br else None):
            raise HTTPException(400, "Break overlaps")

    if br:
        for k, v in payload.dict(exclude_unset=True).items():
            setattr(br, k, v)
    else:
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

# ============================================================
# Kiosk Endpoints (no auth)
# ============================================================
@timeclock_router.get("/state/{code}", summary="Kiosk: current status by 4-digit code")
def state_by_code(code: Annotated[str, Field(min_length=4, max_length=4, pattern=r"^\d{4}$")],
                  db: Session = Depends(get_db)):
    emp = _emp_by_code(db, code)
    te = _current_open_time_entry(db, emp.id)

    user = db.query(User).filter(User.employee_id == emp.id).order_by(User.id.asc()).first()
    display_name = getattr(user, "name", None) or getattr(emp, "name", None) or f"Emp {emp.id}"

    payload = {
        "employee_id": emp.id,
        "name": display_name,
        "customer_name": getattr(getattr(emp, "customer", None), "name", None),
    }

    if not te:
        payload.update({"status": "off", "time_entry_id": None, "break_id": None})
        return payload

    br = _current_open_break(db, te.id)
    payload.update({
        "status": "break" if br else "in",
        "time_entry_id": te.id,
        "break_id": br.id if br else None,
    })
    return payload

@timeclock_router.post("/start", summary="Kiosk: clock in by code")
def kiosk_start(payload: KioskStartPayload, db: Session = Depends(get_db)):
    emp = _emp_by_code(db, payload.code)

    open_te = _current_open_time_entry(db, emp.id)
    if open_te:
        open_te.clock_out_at = now_utc()
        open_te.status = "closed"
        db.flush()

    pay_user = db.query(User).filter(User.employee_id == emp.id).order_by(User.id.asc()).first()

    te = TimeEntry(
        employee_id=emp.id,
        created_by_user_id=None,
        work_user_id=pay_user.id if pay_user else None,
        clock_in_at=now_utc(),
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

@timeclock_router.post("/stop", summary="Kiosk: clock out (auto-closes open breaks)")
def kiosk_stop(payload: KioskStopPayload, db: Session = Depends(get_db)):
    emp = _emp_by_code(db, payload.code)
    te = _current_open_time_entry(db, emp.id)
    if not te:
        raise HTTPException(400, "No open time entry to stop")

    now = now_utc()

    open_breaks = (
        db.query(BreakEntry)
          .filter(BreakEntry.time_entry_id == te.id, BreakEntry.end_at.is_(None))
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

    db.commit(); db.refresh(te)
    return {
        "id": te.id,
        "employee_id": te.employee_id,
        "work_user_id": te.work_user_id,
        "clock_out_at": te.clock_out_at,
        "status": te.status,
        "auto_closed_breaks": [b.id for b in open_breaks],
    }

@breaks_router.post("/start", summary="Kiosk: start break by code")
def kiosk_start_break(payload: KioskStartBreakPayload, db: Session = Depends(get_db)):
    emp = _emp_by_code(db, payload.code)
    te = _current_open_time_entry(db, emp.id)
    if not te:
        raise HTTPException(400, "You must be clocked in to start a break")

    has_open = (
        db.query(func.count(BreakEntry.id))
          .filter(BreakEntry.time_entry_id == te.id, BreakEntry.end_at.is_(None))
          .scalar() > 0
    )
    if has_open:
        raise HTTPException(400, "A break is already in progress")

    br = BreakEntry(
        time_entry_id=te.id,
        break_type=payload.break_type or "lunch",
        start_at=now_utc(),
        end_at=None,
        method=payload.method or "web",
        location=payload.location,
        notes=payload.notes,
        is_paid=bool(payload.is_paid),
    )
    db.add(br); db.commit(); db.refresh(br)
    return _serialize_break(br)

@breaks_router.post("/stop", summary="Kiosk: stop current break by code")
def kiosk_stop_break(payload: KioskStopBreakPayload, db: Session = Depends(get_db)):
    emp = _emp_by_code(db, payload.code)
    te = _current_open_time_entry(db, emp.id)
    if not te:
        raise HTTPException(400, "You must be clocked in to stop a break")

    br = _current_open_break(db, te.id)
    if not br:
        raise HTTPException(400, "No break in progress")

    br.end_at = now_utc()
    db.commit(); db.refresh(br)
    return _serialize_break(br)

# ============================================================
# List / Get (no auth)
# ============================================================
@timeclock_router.get("", summary="List time entries (optional range filter)")
def list_time_entries(
    db: Session = Depends(get_db),
    employee_id: Optional[int] = Query(default=None),
    start_at: Optional[datetime] = Query(default=None, description="clock_in_at >= start_at"),
    end_at: Optional[datetime] = Query(default=None, description="clock_in_at < end_at (exclusive)"),
) -> List[dict]:
    q = (
        db.query(TimeEntry)
          .options(joinedload(TimeEntry.employee), joinedload(TimeEntry.breaks))
    )
    if employee_id is not None:
        q = q.filter(TimeEntry.employee_id == employee_id)
    if start_at is not None:
        q = q.filter(TimeEntry.clock_in_at >= start_at)
    if end_at is not None:
        q = q.filter(TimeEntry.clock_in_at < end_at)
    q = q.order_by(TimeEntry.clock_in_at.asc(), TimeEntry.id.asc())
    rows = q.all()
    return [_serialize_time_entry(te) for te in rows]

@timeclock_router.get("/range", summary="List time entries by range (alias)")
def list_time_entries_range(
    db: Session = Depends(get_db),
    employee_id: Optional[int] = Query(default=None),
    status: Optional[List[str]] = Query(None, description="Filter Employee.status, e.g. ?status=active&status=on_leave"),
    start_at: datetime = Query(..., description="inclusive"),
    end_at: datetime   = Query(..., description="exclusive"),
) -> List[dict]:
    q = (
        db.query(TimeEntry)
          .join(TimeEntry.employee)
          .options(joinedload(TimeEntry.employee), joinedload(TimeEntry.breaks))
          .filter(TimeEntry.clock_in_at >= start_at, TimeEntry.clock_in_at < end_at)
    )
    if status:
        statuses = [s.lower() for s in status]
        q = q.filter(Employee.status.in_(statuses))
    if employee_id is not None:
        q = q.filter(TimeEntry.employee_id == employee_id)
    q = q.order_by(TimeEntry.clock_in_at.asc(), TimeEntry.id.asc())
    rows = q.all()
    return [_serialize_time_entry(te) for te in rows]

@timeclock_router.get("/{time_entry_id}", summary="Get one time entry")
def get_time_entry(time_entry_id: int, db: Session = Depends(get_db)) -> dict:
    te = (
        db.query(TimeEntry)
          .options(joinedload(TimeEntry.employee), joinedload(TimeEntry.breaks))
          .get(time_entry_id)
    )
    if not te:
        raise HTTPException(404, "TimeEntry not found")
    return _serialize_time_entry(te)
