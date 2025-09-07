# routers/v1/payroll_extras.py
from typing import List, Dict, Optional
from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from datetime import timezone
from database import get_db
from models import PayPeriod, TimeEntry, BreakEntry, Employee

router = APIRouter(
    prefix="/payroll",
    tags=["payroll"],
)

# ---------- helpers ----------
def _get_pp_or_404(db: Session, pp_id: int) -> PayPeriod:
    pp = db.get(PayPeriod, pp_id)
    if not pp:
        raise HTTPException(status_code=404, detail="PayPeriod not found")
    return pp

def _to_utc_date(dt) -> Optional[str]:
    """Match client behavior which grouped by UTC date (JS toISOString().slice(0,10))."""
    if not dt:
        return None
    if dt.tzinfo is None:
        # assume already UTC-like
        return dt.date().isoformat()
    return dt.astimezone(timezone.utc).date().isoformat()
# ============================================================
# 1) รายชื่อพนักงานในช่วง Pay Period + ชั่วโมงสุทธิ & จำนวนรายการ
#    GET /payroll/pay-periods/{pp_id}/employees
# ============================================================
@router.get("/pay-periods/{pp_id}/employees")
def employees_in_pay_period(
    pp_id: int,
    db: Session = Depends(get_db),
):
    """
    คืน list ของพนักงานที่มี time entries อยู่ใน pay period นี้
    พร้อม total_hours (สุทธิ: gross - unpaid breaks) และ entry_count
    """
    pp = _get_pp_or_404(db, pp_id)

    # ดึง time entries ทั้งงวด (รวม breaks ด้วย joinedload เพื่อหลีกเลี่ยง N+1)
    entries: List[TimeEntry] = (
        db.query(TimeEntry)
          .options(joinedload(TimeEntry.employee), joinedload(TimeEntry.breaks))
          .filter(TimeEntry.clock_in_at >= pp.start_at,
                  TimeEntry.clock_in_at <  pp.end_at)
          .all()
    )

    agg = defaultdict(lambda: {
        "employee_id": None,
        "emp_code": None,
        "name": None,
        "total_hours": 0.0,
        "entry_count": 0,
    })

    for te in entries:
        if not te.employee_id:
            continue

        emp: Optional[Employee] = te.employee
        rec = agg[te.employee_id]
        rec["employee_id"] = te.employee_id
        rec["emp_code"] = getattr(emp, "emp_code", None)
        rec["name"] = getattr(emp, "name", None)
        rec["entry_count"] += 1

        if te.clock_in_at and te.clock_out_at:
            gross_h = (te.clock_out_at - te.clock_in_at).total_seconds() / 3600.0
            unpaid_h = 0.0
            for br in getattr(te, "breaks", []) or []:
                if not br.is_paid and br.start_at and br.end_at:
                    unpaid_h += (br.end_at - br.start_at).total_seconds() / 3600.0
            rec["total_hours"] += max(0.0, gross_h - unpaid_h)

    # ออกเป็น list เรียงตามชื่อพนักงาน
    rows = list(agg.values())
    rows.sort(key=lambda x: (x["name"] or "").lower())
    return rows


# ============================================================
# 2) รายการ TimeEntry ของพนักงานในช่วง Pay Period
#    GET /payroll/time-entries/by-employee?employee_id=&pp_id=
# ============================================================
@router.get("/time-entries/by-employee")
def time_entries_by_employee(
    employee_id: int = Query(...),
    pp_id: int = Query(...),
    db: Session = Depends(get_db),
) -> List[Dict]:
    """
    คืน time entries ของพนักงานภายใน pay period ที่ระบุ
    รวม breaks และข้อมูลพนักงานที่จำเป็นสำหรับหัวตาราง
    """
    pp = _get_pp_or_404(db, pp_id)

    rows: List[TimeEntry] = (
        db.query(TimeEntry)
          .options(
              joinedload(TimeEntry.breaks),
              joinedload(TimeEntry.employee),
          )
          .filter(
              TimeEntry.employee_id == employee_id,
              TimeEntry.clock_in_at >= pp.start_at,
              TimeEntry.clock_in_at <  pp.end_at,
          )
          .order_by(TimeEntry.clock_in_at.asc())
          .all()
    )

    def ser_break(b: BreakEntry) -> Dict:
        return {
            "id": b.id,
            "break_type": b.break_type,
            "start_at": b.start_at,
            "end_at": b.end_at,
            "is_paid": b.is_paid,
        }

    out: List[Dict] = []
    for r in rows:
        emp = r.employee
        out.append({
            "id": r.id,
            "employee_id": r.employee_id,
            "employee": {
                "id": getattr(emp, "id", None),
                "emp_code": getattr(emp, "emp_code", None),
                "name": getattr(emp, "name", None),
            },
            "clock_in_at": r.clock_in_at,
            "clock_out_at": r.clock_out_at,
            "status": r.status,
            "breaks": [ser_break(b) for b in (r.breaks or [])],
            "notes": r.notes,
        })
    return out


# ============================================================
# 2) Daily summary for an employee in a pay period (server-side)
#    GET /payroll/pay-periods/{pp_id}/employees/{employee_id}/daily-summary
#    Query:
#      - closed_only: bool = False
#      - ot_daily_threshold: float = 8.0 (hours)
# ============================================================
@router.get("/pay-periods/{pp_id}/employees/{employee_id}/daily-summary")
def daily_summary(
    pp_id: int,
    employee_id: int,
    closed_only: bool = Query(False),
    ot_daily_threshold: float = Query(8.0),
    db: Session = Depends(get_db),
):
    pp = _get_pp_or_404(db, pp_id)

    q = (
        db.query(TimeEntry)
        .options(joinedload(TimeEntry.breaks))
        .filter(
            TimeEntry.employee_id == employee_id,
            TimeEntry.clock_in_at >= pp.start_at,
            TimeEntry.clock_in_at <  pp.end_at,
        )
    )
    if closed_only:
        q = q.filter(TimeEntry.status == "closed")

    rows: List[TimeEntry] = q.order_by(TimeEntry.clock_in_at.asc()).all()

    # group by UTC date key (to match prior JS behavior)
    by_date: Dict[str, List[TimeEntry]] = defaultdict(list)
    for te in rows:
        key = _to_utc_date(te.clock_in_at or te.clock_out_at)
        if key:
            by_date[key].append(te)

    out_rows = []
    sum_reg = 0.0
    sum_ot = 0.0

    for date_key, arr in sorted(by_date.items(), key=lambda x: x[0]):
        earliest_in = min((x.clock_in_at for x in arr if x.clock_in_at), default=None)
        latest_out  = max((x.clock_out_at for x in arr if x.clock_out_at), default=None)

        gross = 0.0
        unpaid = 0.0
        for x in arr:
            if x.clock_in_at and x.clock_out_at:
                gross += max(0.0, (x.clock_out_at - x.clock_in_at).total_seconds() / 3600.0)
            for b in x.breaks or []:
                if not b.is_paid and b.start_at and b.end_at:
                    unpaid += max(0.0, (b.end_at - b.start_at).total_seconds() / 3600.0)

        net = max(0.0, gross - unpaid)
        reg = min(net, ot_daily_threshold)
        ot  = max(0.0, net - ot_daily_threshold)

        sum_reg += reg
        sum_ot  += ot

        out_rows.append({
            "date": date_key,
            "earliest_in": earliest_in,
            "latest_out": latest_out,
            "unpaid_break_hours": round(unpaid, 4),
            "net_hours": round(net, 4),
            "reg_hours": round(reg, 4),
            "ot_hours": round(ot, 4),
            "entry_count": len(arr),
        })

    return {
        "employee_id": employee_id,
        "pay_period_id": pp_id,
        "ot_daily_threshold": ot_daily_threshold,
        "rows": out_rows,
        "totals": {
            "reg_hours": round(sum_reg, 4),
            "ot_hours": round(sum_ot, 4),
        },
    }