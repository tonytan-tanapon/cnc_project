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
    order_by: Optional[str] = Query("due_date"),
):
    allowed_order = {
        "due_date", "po_number", "lot_no", "customer_name",
        "shipment_status", "last_ship_date"
    }
    order_col = order_by if order_by in allowed_order else "due_date"

    conditions = []
    params = {}

    if customer:
        conditions.append("customer_name ILIKE :customer")
        params["customer"] = f"%{customer}%"
    if status:
        conditions.append("shipment_status = :status")
        params["status"] = status

    sql = "SELECT * FROM v_lot_shipment_status2"
    if conditions:
        sql += " WHERE " + " AND ".join(conditions)
    sql += f" ORDER BY {order_col}"

    query = text(sql)
    result = db.execute(query, params).mappings().all()
    print(result[0].keys())
    return list(result)
