# routers/reports_due_date_monitor.py
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
from database import get_db

router = APIRouter(prefix="/reports", tags=["reports"])

# Whitelist mapping: Tabulator field -> SQL column/expression
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
    sort_by: str = Query("po_line_due_date"),     # default sort
    sort_dir: str = Query("asc"),                 # asc|desc
    db: Session = Depends(get_db),
):
    col = SORTABLE.get(sort_by, "po_line_due_date")
    dir_sql = "ASC" if str(sort_dir).lower() != "desc" else "DESC"

    # NULLS LAST so blank dates don’t float to top on ASC
    order_sql = f"{col} {dir_sql} NULLS LAST, po_no ASC, lot_no ASC"

    sql = text(f"""
        SELECT *
        FROM vw_deadline_monitor_with_days
        WHERE days_until_po_due >= 0
        ORDER BY {order_sql}
        LIMIT :limit OFFSET :skip
    """)
    rows = db.execute(sql, {"limit": limit, "skip": skip}).mappings().all()
    return {"items": [dict(r) for r in rows]}
