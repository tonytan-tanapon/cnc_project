# routers/payroll.py
from datetime import date, timedelta, datetime
from typing import Optional, List, Dict
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import and_

from database import get_db
from models import PayPeriod, PayRate, Employee   # <- เพิ่ม PayRate, Employee
from schemas import PayPeriodCreate, PayPeriodUpdate, PayPeriodOut
# from deps.authz import require_perm  # ถ้าจะเปิด authz คอมเมนต์กลับเข้าไป

# -----------------------------------------------------------------------------------
# Router เดิม (คงไว้)  PREFIX = /payroll   >>> ยังคงใช้ได้เพื่อ backward-compat
# -----------------------------------------------------------------------------------
router = APIRouter(
    prefix="/payroll",
    tags=["payroll"],
    # dependencies=[Depends(require_perm("PAYROLL_VIEW"))],
)

# ========== PAY PERIOD: APIs เดิมคงไว้ ==========
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

@router.get("", response_model=list[PayPeriodOut])
def list_pay_periods(status: str | None = None, db: Session = Depends(get_db)):
    q = db.query(PayPeriod).order_by(PayPeriod.start_at.desc())
    if status:
        q = q.filter(PayPeriod.status == status)
    return q.all()



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

@router.post("/{pp_id}/unlock", response_model=PayPeriodOut)
def unlock_pay_period(pp_id: int, db: Session = Depends(get_db)):
    pp = db.get(PayPeriod, pp_id)
    if not pp:
        raise HTTPException(404, "PayPeriod not found")
    pp.status = "open"
    db.commit()
    db.refresh(pp)
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
    db.commit()
    db.refresh(pp)
    return pp

# ✅ ใหม่: ลบ PayPeriod (อนุญาตเฉพาะสถานะ open)
@router.delete("/{pp_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_pay_period(pp_id: int, db: Session = Depends(get_db)):
    pp = db.get(PayPeriod, pp_id)
    if not pp:
        raise HTTPException(404, "PayPeriod not found")
    if pp.status in ("locked", "paid"):
        raise HTTPException(400, "Cannot delete locked/paid PayPeriod")
    db.delete(pp)
    db.commit()
    return None


# ===================================================================================
# 🔹 เพิ่ม Router “alias” ให้ตรงกับ Frontend: /pay-periods (list/get/create/patch/lock…)
# ===================================================================================
periods_router = APIRouter(
    prefix="/pay-periods",
    tags=["payroll"],
    # dependencies=[Depends(require_perm("PAYROLL_VIEW"))],
)

# แชร์ logic กับฟังก์ชันด้านบน โดยเรียกต่ออีกที (DRY)
@periods_router.get("", response_model=list[PayPeriodOut])
def alias_list_pay_periods(status: str | None = None, db: Session = Depends(get_db)):
    return list_pay_periods(status=status, db=db)

@periods_router.post("", response_model=PayPeriodOut)
def alias_create_pay_period(payload: PayPeriodCreate, db: Session = Depends(get_db)):
    return create_pay_period(payload=payload, db=db)

@periods_router.get("/{pp_id}", response_model=PayPeriodOut)
def alias_get_pay_period(pp_id: int, db: Session = Depends(get_db)):
    return get_pay_period(pp_id=pp_id, db=db)

@periods_router.patch("/{pp_id}", response_model=PayPeriodOut)
def alias_update_pay_period(pp_id: int, payload: PayPeriodUpdate, db: Session = Depends(get_db)):
    return update_pay_period(pp_id=pp_id, payload=payload, db=db)

@periods_router.post("/{pp_id}/lock", response_model=PayPeriodOut)
def alias_lock_pay_period(pp_id: int, db: Session = Depends(get_db)):
    return lock_pay_period(pp_id=pp_id, db=db)

@periods_router.post("/{pp_id}/unlock", response_model=PayPeriodOut)
def alias_unlock_pay_period(pp_id: int, db: Session = Depends(get_db)):
    return unlock_pay_period(pp_id=pp_id, db=db)

@periods_router.post("/{pp_id}/mark-paid", response_model=PayPeriodOut)
def alias_mark_paid(pp_id: int, db: Session = Depends(get_db)):
    return mark_paid(pp_id=pp_id, db=db)

@periods_router.delete("/{pp_id}", status_code=status.HTTP_204_NO_CONTENT)
def alias_delete_pay_period(pp_id: int, db: Session = Depends(get_db)):
    return delete_pay_period(pp_id=pp_id, db=db)


# ===================================================================================
# 🔹 เพิ่ม Router สำหรับ Pay Rates: /pay-rates และ /pay-rates/bulk
# ===================================================================================
rates_router = APIRouter(
    prefix="/pay-rates",
    tags=["payroll"],
    # dependencies=[Depends(require_perm("PAYROLL_VIEW"))],
)

def _serialize_rate(r: PayRate) -> Dict:
    return {
        "id": r.id,
        "employee_id": r.employee_id,
        "effective_from": r.effective_from,
        "hourly_rate": float(r.hourly_rate) if r.hourly_rate is not None else None,
        "ot_multiplier": float(r.ot_multiplier) if r.ot_multiplier is not None else None,
        "dt_multiplier": float(r.dt_multiplier) if r.dt_multiplier is not None else None,
    }

# GET /pay-rates?employee_id=&as_of=&latest_only=
@rates_router.get("")
def list_pay_rates(
    employee_id: Optional[int] = None,
    as_of: Optional[datetime] = None,
    latest_only: bool = False,
    db: Session = Depends(get_db),
):
    # print("Hello")
    q = db.query(PayRate)
    if employee_id is not None:
        q = q.filter(PayRate.employee_id == employee_id)
        # q = q.filter(PayRate.status == "active")

    if as_of is not None:
        # ถ้าต้องการรายการเดียวที่มีผล ณ เวลา as_of (latest_only)
        if employee_id is not None and latest_only:
            r = (
                q.filter(PayRate.effective_from <= as_of)
                 .order_by(PayRate.effective_from.desc())
                 .first()
            )
            return _serialize_rate(r) if r else None
        else:
            # รายการทั้งหมดที่ effective_from <= as_of
            q = q.filter(PayRate.effective_from <= as_of)

    q = q.order_by(PayRate.employee_id.asc(), PayRate.effective_from.asc())
    return [_serialize_rate(r) for r in q.all()]

# GET /pay-rates/bulk?employee_ids=1,2,3&as_of=...
@rates_router.get("/bulk")
def bulk_pay_rates(
    employee_ids: str = Query(..., description="Comma-separated employee IDs"),
    as_of: Optional[datetime] = None,
    latest_only: bool = True,  # โดยปกติอยากได้ rate ที่มีผลล่าสุดของแต่ละคน
    db: Session = Depends(get_db),
):
    try:
        ids = [int(x) for x in employee_ids.split(",") if x.strip()]
    except ValueError:
        raise HTTPException(400, "employee_ids must be integers separated by comma")

    results: List[Dict] = []
    if latest_only and as_of is not None:
        # ดึง “รายการเดียวต่อคน” ที่ effective_from <= as_of
        for eid in ids:
            r = (
                db.query(PayRate)
                  .filter(PayRate.employee_id == eid,
                          PayRate.effective_from <= as_of)
                  .order_by(PayRate.effective_from.desc())
                  .first()
            )
            if r:
                results.append(_serialize_rate(r))
        return results

    # ไม่ latest_only หรือไม่มี as_of: คืนทุกรายการของ IDs ที่ระบุ
    rows = (
        db.query(PayRate)
          .filter(PayRate.employee_id.in_(ids))
          .order_by(PayRate.employee_id.asc(), PayRate.effective_from.asc())
          .all()
    )
    return [_serialize_rate(r) for r in rows]

from routers.v1.payroll_engine import calculate_timesheet

from models import TimeEntry, BreakEntry

def get_time_entries(db: Session, employee_id: int, start_at, end_at):

    rows = (
        db.query(TimeEntry)
        .filter(
            TimeEntry.employee_id == employee_id,
            TimeEntry.clock_in_at >= start_at,
            TimeEntry.clock_in_at <= end_at
        )
        .order_by(TimeEntry.clock_in_at)
        .all()
    )

    result = []

    for r in rows:
        result.append({
            "id": r.id,
            "clock_in_at": r.clock_in_at,
            "clock_out_at": r.clock_out_at,
            "breaks": [
                {
                    "start_at": b.start_at,
                    "end_at": b.end_at
                }
                for b in r.breaks
            ]
        })

    return result

@router.get("/timesheet/by-employee")
def payroll_timesheet(
    employee_id: int,
    pp_id: int,
    db: Session = Depends(get_db)
):

    pp = db.get(PayPeriod, pp_id)

    if not pp:
        raise HTTPException(404, "Pay period not found")

    rows = (
        db.query(TimeEntry)
        .filter(
            TimeEntry.employee_id == employee_id,
            TimeEntry.clock_in_at >= pp.start_at,
            TimeEntry.clock_in_at <= pp.end_at
        )
        .order_by(TimeEntry.clock_in_at)
        .all()
    )

    result = []

    for r in rows:

        breaks = []
        break_hours = 0

        for b in r.breaks:
            breaks.append({
                "id": b.id,
                "start_at": b.start_at,
                "end_at": b.end_at
            })

            if b.start_at and b.end_at:
                break_hours += (b.end_at - b.start_at).total_seconds() / 3600

        total_hours = 0
        if r.clock_in_at and r.clock_out_at:
            total_hours = (
                (r.clock_out_at - r.clock_in_at).total_seconds() / 3600
            ) - break_hours

        reg_hours = min(8, total_hours)
        ot_hours = max(0, total_hours - 8)

        result.append({
            "id": r.id,
            "clock_in_at": r.clock_in_at,
            "clock_out_at": r.clock_out_at,
            "breaks": breaks,
            "notes": r.notes,
            "reg_hours": round(reg_hours, 2),
            "ot_hours": round(ot_hours, 2)
        })

    return result

def apply_six_day_rule(entries):

    from collections import defaultdict

    weeks = defaultdict(list)

    for e in entries:
        wk = e["clock_in_at"].date().isocalendar()[1]
        weeks[wk].append(e)

    for week_entries in weeks.values():

        worked = [e for e in week_entries if (e["reg_hours"] + e["ot_hours"]) > 0]

        if len(worked) >= 6:

            lowest = min(worked, key=lambda x: x["reg_hours"] + x["ot_hours"])

            lowest["ot_hours"] += lowest["reg_hours"]
            lowest["reg_hours"] = 0

    return entries

@router.get("/kiosk-timesheet")
def kiosk_timesheet(employee_id: int, db: Session = Depends(get_db)):

    periods = (
        db.query(PayPeriod)
        .order_by(PayPeriod.start_at.desc())
        .limit(2)
        .all()
    )

    result = []

    for pp in periods:

        rows = (
            db.query(TimeEntry)
            .filter(
                TimeEntry.employee_id == employee_id,
                TimeEntry.clock_in_at >= pp.start_at,
                TimeEntry.clock_in_at <= pp.end_at
            )
            .order_by(TimeEntry.clock_in_at)
            .all()
        )

        entries = []

        for r in rows:

            breaks = []
            break_hours = 0

            for b in r.breaks:
                breaks.append({
                    "start_at": b.start_at,
                    "end_at": b.end_at
                })

                if b.start_at and b.end_at:
                    break_hours += (b.end_at - b.start_at).total_seconds() / 3600

            total_hours = 0
            if r.clock_in_at and r.clock_out_at:
                total_hours = (
                    (r.clock_out_at - r.clock_in_at).total_seconds() / 3600
                ) - break_hours

            reg_hours = min(8, total_hours)
            ot_hours = max(0, total_hours - 8)

            entries.append({
                "clock_in_at": r.clock_in_at,
                "clock_out_at": r.clock_out_at,
                "breaks": breaks,
                "reg_hours": round(reg_hours, 2),
                "ot_hours": round(ot_hours, 2)
            })
        entries = apply_six_day_rule(entries)
        result.append({
            "period": {
                "id": pp.id,
                "start_at": pp.start_at,
                "end_at": pp.end_at
            },
            "entries": entries
        })

    return result

@router.get("/{pp_id}", response_model=PayPeriodOut)
def get_pay_period(pp_id: int, db: Session = Depends(get_db)):
    pp = db.get(PayPeriod, pp_id)
    if not pp:
        raise HTTPException(404, "PayPeriod not found")
    return pp