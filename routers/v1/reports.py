# routers/reports.py
from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import select, func
from sqlalchemy.orm import Session
from typing import Optional, Dict, List
from decimal import Decimal, ROUND_DOWN
from database import get_db
from models import LotMaterialUse
from models import ShopTraveler, ShopTravelerStep
from sqlalchemy.orm import aliased
router = APIRouter(prefix="/reports", tags=["reports"])

def _parse_ids_from_request(request: Request, csv_fallback: Optional[str]) -> List[int]:
    ids: List[int] = []
    def add(tok: str):
        tok = tok.strip()
        if not tok:
            return
        try:
            n = int(tok)
            if n > 0:
                ids.append(n)
        except ValueError:
            pass
    for v in request.query_params.getlist("lot_ids"):
        for tok in v.split(","):
            add(tok)
    if csv_fallback:
        for tok in csv_fallback.split(","):
            add(tok)
    return sorted(set(ids))

@router.get("/lot-consumption")   # ← เพิ่มบรรทัดนี้
def get_lot_consumption(
    request: Request,
    lot_ids_csv: Optional[str] = Query(None, description="comma-separated lot ids"),
    db: Session = Depends(get_db),
) -> Dict[str, str]:
    ids = _parse_ids_from_request(request, lot_ids_csv)
    if not ids:
        return {}
    rows = db.execute(
        select(
            LotMaterialUse.lot_id,
            func.coalesce(func.sum(LotMaterialUse.qty), 0).label("qty_used"),
        )
        .where(LotMaterialUse.lot_id.in_(ids))
        .group_by(LotMaterialUse.lot_id)
    ).all()

    result: Dict[str, str] = {str(i): "0.000" for i in ids}
    for lot_id, qty_used in rows:
        q = Decimal(qty_used).quantize(Decimal("0.000"), rounding=ROUND_DOWN)
        result[str(lot_id)] = str(q)
    return result



from sqlalchemy import text
@router.get("/shop-traveler-status")
def get_shop_traveler_status(
    db: Session = Depends(get_db),
):

    sql = """

        SELECT *

        FROM vw_current_shop_traveler_status

        ORDER BY

            
            progress_percent DESC,
            lot_no ASC

    """

    rows = db.execute(
        text(sql)
    ).mappings().all()

    return [
        dict(r)
        for r in rows
    ]

from fastapi import Depends, Query
from sqlalchemy import text
from sqlalchemy.orm import Session
from database import get_db

@router.get("/attendance-summary")
def attendance_summary(
    db: Session = Depends(get_db),
    q: str | None = Query(None),
    department: str | None = Query(None),
    date_from: str | None = Query(None),
    date_to: str | None = Query(None),
    sort_field: str = Query("name"),
    sort_dir: str = Query("asc"),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=500),
):
    where = []
    params = {"skip": skip, "limit": limit}

    if q:
        where.append("(name ILIKE :q OR lastname ILIKE :q OR emp_code ILIKE :q)")
        params["q"] = f"%{q}%"

    if department:
        where.append("department = :department")
        params["department"] = department

    if date_from:
        where.append("work_date >= :date_from")
        params["date_from"] = date_from

    if date_to:
        where.append("work_date <= :date_to")
        params["date_to"] = date_to

    where_sql = "WHERE " + " AND ".join(where) if where else ""

    sort_map = {
        "emp_code":"emp_code","name":"name","department":"department",
        "present_days":"present_days","late_days":"late_days",
        "absent_days":"absent_days","half_days":"half_days",
        "vacation_days":"vacation_days","sick_days":"sick_days",
        "holiday_days":"holiday_days","work_hours":"work_hours",
        "ot_hours":"ot_hours","late_minutes":"late_minutes",
        "attendance_percent":"attendance_percent"
    }

    sort_field = sort_map.get(sort_field, "name")
    sort_dir = "DESC" if sort_dir.lower() == "desc" else "ASC"

    sql = f"""
    SELECT
        employee_id,
        payroll_emp_id,
        emp_code,
        name,
        lastname,
        employee_name,
        department,

        MIN(first_work_date) AS first_work_date,
        MAX(last_work_date) AS last_work_date,


        COUNT(*) FILTER (WHERE is_present) present_days,
        COUNT(*) FILTER (WHERE is_late) late_days,
        COUNT(*) FILTER (WHERE is_absent) absent_days,
        COUNT(*) FILTER (WHERE is_half_day) half_days,

        COUNT(*) FILTER (WHERE LOWER(COALESCE(leave_type,''))='vacation') vacation_days,
        COUNT(*) FILTER (WHERE LOWER(COALESCE(leave_type,''))='sick') sick_days,
        COUNT(*) FILTER (WHERE LOWER(COALESCE(leave_type,''))='holiday') holiday_days,

        COALESCE(SUM(work_hours),0) work_hours,
        COALESCE(SUM(ot_hours),0) ot_hours,
        COALESCE(SUM(late_minutes),0) late_minutes,

        COALESCE(
            ROUND(
                COUNT(*) FILTER (WHERE is_present)::numeric /
                NULLIF(
                    COUNT(*) FILTER (
                        WHERE is_workday
                        AND NOT is_holiday
                    ),
                    0
                ) * 100,
                2
            ),
            0
        ) attendance_percent

    FROM v_employee_calendar
    {where_sql}

    GROUP BY
        employee_id,payroll_emp_id,emp_code,name,lastname,employee_name,department

    ORDER BY {sort_field} {sort_dir}
    OFFSET :skip
    LIMIT :limit
    """

    rows = db.execute(text(sql), params).mappings().all()

    count_sql = f"""
    SELECT COUNT(*)
    FROM (
        SELECT employee_id
        FROM v_employee_calendar
        {where_sql}
        GROUP BY employee_id
    ) t
    """

    total = db.execute(text(count_sql), params).scalar() or 0

    summary_sql = f"""
    SELECT
        COUNT(*) employee_count,
        ROUND(AVG(attendance_percent),2) attendance_rate,
        COALESCE(SUM(late_days),0) total_late,
        COALESCE(SUM(absent_days),0) total_absent,
        COALESCE(SUM(ot_hours),0) total_ot
    FROM (
        SELECT
            employee_id,
            COUNT(*) FILTER (WHERE is_late) late_days,
            COUNT(*) FILTER (WHERE is_absent) absent_days,
            COALESCE(SUM(ot_hours),0) ot_hours,
            COALESCE(
                ROUND(
                    COUNT(*) FILTER (WHERE is_present)::numeric /
                    NULLIF(
                        COUNT(*) FILTER (
                            WHERE is_workday
                            AND NOT is_holiday
                        ),
                        0
                    ) * 100,
                    2
                ),
                0
            ) attendance_percent
        FROM v_employee_calendar
        {where_sql}
        GROUP BY employee_id
    ) s
    """

    summary = db.execute(text(summary_sql), params).mappings().first()

    return {
        "data": [dict(r) for r in rows],
        "last_page": (total + limit - 1) // limit if total else 1,
        "last_row": total,
        "summary": dict(summary) if summary else {}
    }



@router.get("/attendance-detail")
def attendance_detail(
    employee_id: int = Query(...),
    date_from: str | None = Query(None),
    date_to: str | None = Query(None),
    db: Session = Depends(get_db),
):
    where = [
        "employee_id = :employee_id",
        """
        (
            first_work_date IS NULL
            OR (
                work_date >= first_work_date
                AND work_date <= COALESCE(last_work_date, CURRENT_DATE)
            )
        )
        """
    ]

    params = {
        "employee_id": employee_id
    }

    if date_from:
        where.append("work_date >= :date_from")
        params["date_from"] = date_from

    if date_to:
        where.append("work_date <= :date_to")
        params["date_to"] = date_to

    where_sql = "WHERE " + " AND ".join(where)

    # ----------------------------------------------------
    # Employee
    # ----------------------------------------------------

    employee_sql = f"""
    SELECT

        employee_name,
        emp_code,
        department,
        position,

        MIN(first_work_date) first_work_date,
        MAX(last_work_date) last_work_date

    FROM v_employee_calendar

    {where_sql}

    GROUP BY
        employee_name,
        emp_code,
        department,
        position
    """

    employee = db.execute(
        text(employee_sql),
        params
    ).mappings().first()

    # ----------------------------------------------------
    # Summary
    # ----------------------------------------------------

    summary_sql = f"""
    SELECT

        COUNT(*) FILTER (WHERE is_present) present_days,

        COUNT(*) FILTER (WHERE is_late) late_days,

        COUNT(*) FILTER (WHERE is_absent) absent_days,

        COUNT(*) FILTER (WHERE is_half_day) half_days,

        COUNT(*) FILTER (
            WHERE LOWER(COALESCE(leave_type,''))='vacation'
        ) vacation_days,

        COUNT(*) FILTER (
            WHERE LOWER(COALESCE(leave_type,''))='sick'
        ) sick_days,

        COUNT(*) FILTER (
            WHERE LOWER(COALESCE(leave_type,''))='holiday'
        ) holiday_days,

        COALESCE(SUM(work_hours),0) work_hours,

        COALESCE(SUM(ot_hours),0) ot_hours,

        COALESCE(SUM(late_minutes),0) late_minutes,

        COALESCE(
            ROUND(
                COUNT(*) FILTER (WHERE is_present)::numeric
                /
                NULLIF(
                    COUNT(*) FILTER (
                        WHERE is_workday
                        AND NOT is_holiday
                    ),
                    0
                ) * 100,
                2
            ),
            0
        ) attendance_percent

    FROM v_employee_calendar

    {where_sql}
    """

    summary = db.execute(
        text(summary_sql),
        params
    ).mappings().first()

    # ----------------------------------------------------
    # Daily Detail
    # ----------------------------------------------------

    detail_sql = f"""
    SELECT

        work_date,

        day_name,

        attendance_status,

        attendance_code,

        clock_in_at,

        clock_out_at,

        break_hours,

        work_hours,

        regular_hours,

        ot_hours,

        late_minutes,

        leave_type,

        holiday_name

    FROM v_employee_calendar

    {where_sql}

    ORDER BY work_date DESC
    """

    rows = db.execute(
        text(detail_sql),
        params
    ).mappings().all()

    return {

        "employee": dict(employee) if employee else {},

        "summary": dict(summary) if summary else {},

        "data": [dict(r) for r in rows]

    }