# routers/report_traveler.py

from datetime import date, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func

from database import get_db
from models import (
    Employee,
    ShopTravelerStepLog,
    ShopTravelerStep,
    ShopTraveler,
    ProductionLot,
    Part
)

router = APIRouter(
    prefix="/reports_traveler",
    tags=["reports_traveler"]
)


@router.get("/employee-log-monitor")
def employee_log_monitor(
    days_back: int = 15,
    db: Session = Depends(get_db)
):

    # ----------------------------
    # date range
    # ----------------------------

    today = date.today()

    days = [
        today - timedelta(days=i)
        for i in range(days_back)
    ]

    start_date = days[-1]

    # ----------------------------
    # employees
    # ----------------------------

    employees = (
        db.query(Employee)
        .filter(
            Employee.status == "active"
        )
        .filter(
            Employee.emp_op.isnot(None)
        )
        .order_by(
            Employee.emp_op,
            Employee.nickname
        )
        .all()
    )

    # ----------------------------
    # last log date
    # ----------------------------

    last_logs = (
        db.query(
            ShopTravelerStepLog.operator_id,
            func.max(
                ShopTravelerStepLog.work_date
            ).label("last_date")
        )
        .group_by(
            ShopTravelerStepLog.operator_id
        )
        .all()
    )

    last_map = {
        r.operator_id: r.last_date
        for r in last_logs
    }

    # ----------------------------
    # recent logs
    # ----------------------------

    logs = (
        db.query(
            ShopTravelerStepLog.operator_id,
            ShopTravelerStepLog.work_date,
            ProductionLot.id.label("lot_id"),
            Part.part_no,
            ShopTravelerStep.step_code
        )
        .join(
            ShopTravelerStep,
            ShopTravelerStep.id ==
            ShopTravelerStepLog.step_id
        )
        .join(
            ShopTraveler,
            ShopTraveler.id ==
            ShopTravelerStep.traveler_id
        )
        .join(
            ProductionLot,
            ProductionLot.id ==
            ShopTraveler.lot_id
        )
        .join(
            Part,
            Part.id ==
            ProductionLot.part_id
        )
        .filter(
            ShopTravelerStepLog.work_date >= start_date
        )
        .order_by(
            ShopTravelerStepLog.created_at.desc()
        )
        .all()
    )

    log_map = {}

    for row in logs:

        if row.operator_id is None:
            continue

        log_map.setdefault(
            row.operator_id,
            {}
        )

        # เก็บ part ล่าสุดของวันนั้น
        if row.work_date not in log_map[row.operator_id]:

            log_map[row.operator_id][
                row.work_date
            ] = {
                "part_no": row.part_no,
                "step_code": row.step_code,
                "lot_id": row.lot_id,
            }

    # ----------------------------
    # build rows
    # ----------------------------

    rows = []

    for emp in employees:

        row = {
            "employee_id": emp.id,
            "emp_code": emp.emp_code,
            "emp_op": emp.emp_op,
            "nickname": emp.nickname,
            "name": emp.name,
            "last_record_date": last_map.get(emp.id),
        }

        emp_dates = log_map.get(
            emp.id,
            {}
        )

        missing = 0

        for d in days:

            key = d.isoformat()

            if d in emp_dates:

                row[key] = emp_dates[d]

            else:

                row[key] = None
                missing += 1

        row["missing_days"] = missing

        rows.append(row)

    return rows