# routers/shipment_status.py
from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.orm import Session
from typing import Optional
from database import get_db

router = APIRouter(prefix="/reports", tags=["reports"])

@router.get("/shipment-status")
def get_shipment_status(
    db: Session = Depends(get_db),
    customer: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    order_by: Optional[str] = Query("lot_po_duedate"),

):
    allowed_order = {
        "lot_po_date",
        "po_number",
        "lot_no",
        "customer_name",
        "lot_shipment_status",
        "lot_last_ship_date",
        "days_left",
    }

    order_col = order_by if order_by in allowed_order else "lot_po_duedate"

    conditions = []
    params = {}

    if customer:
        conditions.append("customer_name ILIKE :customer")
        params["customer"] = f"%{customer}%"

    if status:
        conditions.append("lot_shipment_status = :status")
        params["status"] = status

    sql = "SELECT * FROM v_lot_shipment_status"
    if conditions:
        sql += " WHERE " + " AND ".join(conditions)

    sql += f" ORDER BY {order_col}"

    rows = db.execute(text(sql), params).mappings().all()

    # safe debug
    if rows:
        print("Shipment status keys:", rows[0].keys())

    return list(rows)



# =======================
#  PO Shipment Status API
# =======================
# =======================
#  PO Shipment Summary API
# =======================
@router.get("/po-shipment-status")
def get_po_shipment_status(
    db: Session = Depends(get_db),
    customer: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    order_by: Optional[str] = Query("po_number"),
):
    """Return shipment summary per PO (not per PO line)."""

    # Allowed sorting columns
    allowed_order = {
    "lot_po_date",
    "lot_po_duedate",     # ✅ new
    "lot_days_left",     # ✅ new
    "po_number",
    "lot_no",
    "customer_name",
    "lot_shipment_status",
    "lot_last_ship_date",
}

    order_col = order_by if order_by in allowed_order else "po_number"

    # Build WHERE conditions
    conditions = []
    params = {}

    if customer:
        conditions.append("customer_name ILIKE :customer")
        params["customer"] = f"%{customer}%"

    if status:
        conditions.append("po_shipment_status = :status")
        params["status"] = status

    # Build SQL query
    sql = "SELECT * FROM v_po_summary_shipment"
    if conditions:
        sql += " WHERE " + " AND ".join(conditions)
    sql += f" ORDER BY {order_col}"

    # Execute
    rows = db.execute(text(sql), params).mappings().all()

    if rows:
        print("PO summary keys:", rows[0].keys())

    return list(rows)