# routers/reports_due_date_monitor.py
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
from database import get_db

router = APIRouter(prefix="/reports", tags=["reports"])

SORTABLE = {
    "part_no": "part_no",
    "revision": "revision",
    "lot_no": "lot_no",
    "po_no": "po_no",
    "customer_no": "customer_no",
    "po_qty": "po_qty",
    "lot_qty": "lot_qty",
    "po_line_due_date": "po_line_due_date",
    "lot_due_date": "lot_due_date",
    "lot_started_at": "lot_started_at",
    "days_until_po_due": "days_until_po_due",
    "days_until_lot_due": "days_until_lot_due",
    "days_until_lot_start": "days_until_lot_start",
    "lot_status": "lot_status",
}

@router.get("/due-date-monitor")
def get_due_date_monitor(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, gt=0, le=1000),
    sort_by: str = Query("po_line_due_date"),
    sort_dir: str = Query("asc"),
    q: str | None = Query(None, description="search part/po/lot/customer"),
    db: Session = Depends(get_db),
):
    col = SORTABLE.get(sort_by, "po_line_due_date")
    dir_sql = "ASC" if str(sort_dir).lower() != "desc" else "DESC"
    order_sql = f"{col} {dir_sql} NULLS LAST, po_no ASC, lot_no ASC"

    where_sql = "WHERE days_until_po_due >= 0"
    params = {"limit": limit, "skip": skip}

    if q and q.strip():
        params["q"] = f"%{q.strip()}%"
        # *** ชั่วคราว: ยังไม่ใช้ part_name เพราะไม่มีใน view ***
        where_sql += """
          AND (
            part_no ILIKE :q OR
            COALESCE(revision,'') ILIKE :q OR
            COALESCE(lot_no,'') ILIKE :q OR
            COALESCE(po_no,'') ILIKE :q OR
            COALESCE(customer_no,'') ILIKE :q
          )
        """

    sql = text(f"""
        SELECT *
        FROM vw_deadline_monitor_with_days
        {where_sql}
        ORDER BY {order_sql}
        LIMIT :limit OFFSET :skip
    """)

    rows = db.execute(sql, params).mappings().all()
    return {"items": [dict(r) for r in rows]}
