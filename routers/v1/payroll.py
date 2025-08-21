# routers/payroll.py
from datetime import date, timedelta
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

from database import get_db
from models import User
from deps.auth import get_current_user 
from deps.authz import require_perm ## authz 

router = APIRouter(
    prefix="/payroll",
    tags=["payroll"],
    # dependencies=[Depends(require_perm("PAYROLL_VIEW"))],  ## authz
)

@router.get("/summary")
def payroll_summary(
    start: Optional[date] = None,
    end: Optional[date] = None,
    employee_id: Optional[int] = None,
    db: Session = Depends(get_db),
    # user: User = Depends(get_current_user), ## authz
):
    today = date.today()
    if not start:
        start = today.replace(day=1)
    if not end:
        # first day of next month
        end = (start.replace(day=28) + timedelta(days=4)).replace(day=1)

    sql = text(
        """
        WITH e AS (
            SELECT te.employee_id,
                   te.clock_in_at AT TIME ZONE 'UTC'  AS cin,
                   te.clock_out_at AT TIME ZONE 'UTC' AS cout
            FROM time_entries te
            WHERE te.clock_out_at IS NOT NULL
              AND te.clock_in_at >= :start
              AND te.clock_in_at <  :end
              {emp_filter}
        ),
        d AS (
            SELECT employee_id,
                   date_trunc('day', cin) AS day,
                   SUM(EXTRACT(EPOCH FROM (cout - cin))/3600.0) AS h
            FROM e
            GROUP BY employee_id, date_trunc('day', cin)
        ),
        c AS (
            SELECT employee_id,
                   day,
                   CASE WHEN EXTRACT(ISODOW FROM day) IN (6,7) THEN 0 ELSE LEAST(h, 8) END AS reg,
                   CASE WHEN EXTRACT(ISODOW FROM day) IN (6,7) THEN 0 ELSE GREATEST(h-8, 0) END AS ot15,
                   CASE WHEN EXTRACT(ISODOW FROM day) IN (6,7) THEN h ELSE 0 END AS ot20
            FROM d
        )
        SELECT e.id AS employee_id, e.emp_code, e.name,
               COALESCE(SUM(c.reg),0)  AS regular_hours,
               COALESCE(SUM(c.ot15),0) AS ot15_hours,
               COALESCE(SUM(c.ot20),0) AS ot20_hours,
               COALESCE(SUM(c.reg + c.ot15 + c.ot20),0) AS total_hours
        FROM employees e
        LEFT JOIN c ON c.employee_id = e.id
        {emp_join_filter}
        GROUP BY e.id, e.emp_code, e.name
        ORDER BY e.id;
        """.format(
            emp_filter="AND te.employee_id = :emp_id" if employee_id else "",
            emp_join_filter="WHERE e.id = :emp_id" if employee_id else "",
        )
    )

    rows = db.execute(sql, {"start": start, "end": end, "emp_id": employee_id}).mappings().all()
    return [dict(r) for r in rows]
