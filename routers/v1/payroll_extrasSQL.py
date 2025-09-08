# routers/v1/payroll_extras.py
from typing import List, Dict, Optional
from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
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

def _dialect_bits(db: Session):
    """คืนชิ้นส่วน SQL ที่ต่างกันตาม dialect (postgresql / mysql / sqlite)"""
    name = (db.get_bind().dialect.name if db.get_bind() else "postgresql").lower()

    if name.startswith("postgre"):
        diff_te = "EXTRACT(EPOCH FROM (te.clock_out_at - te.clock_in_at))"
        diff_br = "EXTRACT(EPOCH FROM (br.end_at - br.start_at))"
        # GREATEST(0, x)
        def g0(expr: str) -> str:
            return f"GREATEST(0, {expr})"
        lower_name = "LOWER(e.name)"
        unpaid_pred = "COALESCE(br.is_paid, FALSE) = FALSE"
        nulls_last_2 = "(e.name IS NULL), LOWER(e.name)"  # cross-dialect way to push NULLs last
    elif name.startswith("mysql"):
        diff_te = "TIMESTAMPDIFF(SECOND, te.clock_in_at, te.clock_out_at)"
        diff_br = "TIMESTAMPDIFF(SECOND, br.start_at, br.end_at)"
        def g0(expr: str) -> str:
            return f"GREATEST(0, {expr})"
        lower_name = "LOWER(e.name)"
        unpaid_pred = "COALESCE(br.is_paid, 0) = 0"
        nulls_last_2 = "(e.name IS NULL), LOWER(e.name)"
    else:
        # sqlite
        diff_te = "strftime('%s', te.clock_out_at) - strftime('%s', te.clock_in_at)"
        diff_br = "strftime('%s', br.end_at) - strftime('%s', br.start_at)"
        def g0(expr: str) -> str:
            return f"(CASE WHEN ({expr}) > 0 THEN ({expr}) ELSE 0 END)"
        lower_name = "LOWER(e.name)"
        unpaid_pred = "COALESCE(br.is_paid, 0) = 0"
        nulls_last_2 = "(e.name IS NULL), LOWER(e.name)"

    return {
        "diff_te": diff_te,
        "diff_br": diff_br,
        "g0": g0,
        "lower_name": lower_name,
        "unpaid_pred": unpaid_pred,
        "nulls_last_2": nulls_last_2,
    }

# ============================================================
# 1) รายชื่อพนักงานในช่วง Pay Period + ชั่วโมงสุทธิ & จำนวนรายการ (PURE SQL)
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

    te_tbl  = TimeEntry.__tablename__
    br_tbl  = BreakEntry.__tablename__
    emp_tbl = Employee.__tablename__

    bits = _dialect_bits(db)
    diff_te = bits["diff_te"]
    diff_br = bits["diff_br"]
    g0      = bits["g0"]
    lower_name = bits["lower_name"]
    unpaid_pred = bits["unpaid_pred"]
    order_clause = bits["nulls_last_2"]

    sql = text(f"""
    WITH te AS (
        SELECT id, employee_id, clock_in_at, clock_out_at
        FROM {te_tbl} te
        WHERE te.clock_in_at >= :start_at
          AND te.clock_in_at  < :end_at
          AND te.employee_id IS NOT NULL
    ),
    b AS (
        SELECT br.time_entry_id,
               SUM({diff_br}) AS unpaid_seconds
        FROM {br_tbl} br
        JOIN te ON te.id = br.time_entry_id
        WHERE {unpaid_pred}
          AND br.start_at IS NOT NULL
          AND br.end_at   IS NOT NULL
        GROUP BY br.time_entry_id
    ),
    te_net AS (
        SELECT
            te.id AS time_entry_id,
            te.employee_id,
            CASE
              WHEN te.clock_in_at IS NOT NULL AND te.clock_out_at IS NOT NULL
              THEN {g0(f"{diff_te} - COALESCE(b.unpaid_seconds, 0)")}
              ELSE 0
            END AS net_seconds
        FROM te
        LEFT JOIN b ON b.time_entry_id = te.id
    )
    SELECT
        e.id   AS employee_id,
        e.emp_code,
        e.name,
        SUM(te_net.net_seconds) AS total_seconds,
        COUNT(te_net.time_entry_id) AS entry_count
    FROM te_net
    JOIN {emp_tbl} e ON e.id = te_net.employee_id
    GROUP BY e.id, e.emp_code, e.name
    ORDER BY {order_clause}
    """)

    rows = db.execute(sql, {"start_at": pp.start_at, "end_at": pp.end_at}).mappings().all()

    out = []
    for r in rows:
        total_seconds = r.get("total_seconds") or 0
        total_hours = round(float(total_seconds) / 3600.0, 4)
        out.append({
            "employee_id": r["employee_id"],
            "emp_code": r["emp_code"],
            "name": r["name"],
            "total_hours": total_hours,
            "entry_count": r["entry_count"],
        })
    return out

# ============================================================
# 2) รายการ TimeEntry ของพนักงานในช่วง Pay Period (PURE SQL + group ใน Python)
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

    te_tbl  = TimeEntry.__tablename__
    br_tbl  = BreakEntry.__tablename__
    emp_tbl = Employee.__tablename__

    sql = text(f"""
    SELECT
      te.id AS te_id,
      te.employee_id,
      te.clock_in_at,
      te.clock_out_at,
      te.status,
      te.notes,
      e.id   AS emp_id,
      e.emp_code,
      e.name AS emp_name,
      br.id  AS br_id,
      br.break_type AS br_type,
      br.start_at   AS br_start_at,
      br.end_at     AS br_end_at,
      br.is_paid    AS br_is_paid
    FROM {te_tbl} te
    JOIN {emp_tbl} e ON e.id = te.employee_id
    LEFT JOIN {br_tbl} br ON br.time_entry_id = te.id
    WHERE te.employee_id = :employee_id
      AND te.clock_in_at >= :start_at
      AND te.clock_in_at  < :end_at
    ORDER BY te.clock_in_at ASC, br.start_at ASC, br.id ASC
    """)

    rows = db.execute(sql, {
        "employee_id": employee_id,
        "start_at": pp.start_at,
        "end_at": pp.end_at
    }).mappings().all()

    by_te: Dict[int, Dict] = {}
    for r in rows:
        te_id = r["te_id"]
        if te_id not in by_te:
            by_te[te_id] = {
                "id": te_id,
                "employee_id": r["employee_id"],
                "employee": {
                    "id": r["emp_id"],
                    "emp_code": r["emp_code"],
                    "name": r["emp_name"],
                },
                "clock_in_at": r["clock_in_at"],
                "clock_out_at": r["clock_out_at"],
                "status": r["status"],
                "breaks": [],
                "notes": r["notes"],
            }
        if r["br_id"] is not None:
            by_te[te_id]["breaks"].append({
                "id": r["br_id"],
                "break_type": r["br_type"],
                "start_at": r["br_start_at"],
                "end_at": r["br_end_at"],
                "is_paid": r["br_is_paid"],
            })

    # รักษา order ตาม clock_in_at (เราเรียงไว้ใน SQL แล้ว)
    return list(by_te.values())

# ============================================================
# 3) Daily summary for an employee in a pay period (PURE SQL for per-entry calc)
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
    """
    สรุปรายวัน: รวม gross/unpaid/net ต่อวัน (ตาม UTC date key เหมือนฝั่ง JS)
    คิด OT daily threshold ฝั่ง Python เพื่อความอ่านง่าย/ยืดหยุ่น
    """
    pp = _get_pp_or_404(db, pp_id)

    te_tbl  = TimeEntry.__tablename__
    br_tbl  = BreakEntry.__tablename__

    bits = _dialect_bits(db)
    diff_te = bits["diff_te"]
    diff_br = bits["diff_br"]
    g0      = bits["g0"]
    unpaid_pred = bits["unpaid_pred"]

    status_clause = "AND te.status = 'closed'" if closed_only else ""

    # ต่อ entry: คำนวณวินาที gross/unpaid/net ใน SQL
    sql = text(f"""
    WITH te AS (
        SELECT id, employee_id, clock_in_at, clock_out_at, status
        FROM {te_tbl} te
        WHERE te.employee_id = :employee_id
          AND te.clock_in_at >= :start_at
          AND te.clock_in_at  < :end_at
          {status_clause}
    ),
    b AS (
        SELECT br.time_entry_id,
               SUM({diff_br}) AS unpaid_seconds
        FROM {br_tbl} br
        JOIN te ON te.id = br.time_entry_id
        WHERE {unpaid_pred}
          AND br.start_at IS NOT NULL
          AND br.end_at   IS NOT NULL
        GROUP BY br.time_entry_id
    )
    SELECT
        te.id AS time_entry_id,
        te.clock_in_at,
        te.clock_out_at,
        -- gross ต่อแถว (เฉพาะที่ปิดครบ)
        CASE
          WHEN te.clock_in_at IS NOT NULL AND te.clock_out_at IS NOT NULL
          THEN {diff_te}
          ELSE 0
        END AS gross_seconds,
        COALESCE(b.unpaid_seconds, 0) AS unpaid_seconds,
        -- net = max(0, gross - unpaid)
        CASE
          WHEN te.clock_in_at IS NOT NULL AND te.clock_out_at IS NOT NULL
          THEN {g0(f"{diff_te} - COALESCE(b.unpaid_seconds, 0)")}
          ELSE 0
        END AS net_seconds
    FROM te
    LEFT JOIN b ON b.time_entry_id = te.id
    ORDER BY te.clock_in_at ASC, te.id ASC
    """)

    rows = db.execute(sql, {
        "employee_id": employee_id,
        "start_at": pp.start_at,
        "end_at": pp.end_at,
    }).mappings().all()

    # group by UTC date key (เหมือนฝั่ง JS)
    by_date: Dict[str, Dict] = {}
    sum_reg = 0.0
    sum_ot  = 0.0

    for r in rows:
        key = _to_utc_date(r["clock_in_at"] or r["clock_out_at"])
        if not key:
            continue

        d = by_date.get(key)
        if not d:
            d = {
                "date": key,
                "earliest_in": r["clock_in_at"],
                "latest_out": r["clock_out_at"],
                "gross_seconds": 0.0,
                "unpaid_seconds": 0.0,
                "net_seconds": 0.0,
                "entry_count": 0,
            }
            by_date[key] = d

        # earliest/latest
        ci = r["clock_in_at"]
        co = r["clock_out_at"]
        if ci and (d["earliest_in"] is None or ci < d["earliest_in"]):
            d["earliest_in"] = ci
        if co and (d["latest_out"] is None or co > d["latest_out"]):
            d["latest_out"] = co

        d["gross_seconds"]  += float(r["gross_seconds"] or 0)
        d["unpaid_seconds"] += float(r["unpaid_seconds"] or 0)
        d["net_seconds"]    += float(r["net_seconds"] or 0)
        d["entry_count"]    += 1

    out_rows: List[Dict] = []
    for date_key in sorted(by_date.keys()):
        d = by_date[date_key]
        net_h    = round(d["net_seconds"] / 3600.0, 4)
        unpaid_h = round(d["unpaid_seconds"] / 3600.0, 4)

        reg = min(net_h, ot_daily_threshold)
        ot  = max(0.0, net_h - ot_daily_threshold)

        sum_reg += reg
        sum_ot  += ot

        out_rows.append({
            "date": date_key,
            "earliest_in": d["earliest_in"],
            "latest_out": d["latest_out"],
            "unpaid_break_hours": unpaid_h,
            "net_hours": net_h,
            "reg_hours": round(reg, 4),
            "ot_hours": round(ot, 4),
            "entry_count": d["entry_count"],
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
