# routers/shipment_status.py
from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.orm import Session
from typing import Optional
from database import get_db
import json
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
        "po_days_left",        # ✅
        "lot_po_days_left",    # ✅
    }

    order_col = order_by if order_by in allowed_order else "lot_po_duedate"

    conditions = []
    params = {}

    if customer:
        conditions.append("customer_name ILIKE :customer")
        params["customer"] = f"%{customer}%"

    if status:
        if status == "open_po":
            conditions.append(
                "lot_status IN ('not_start', 'in_process')"
            )
        else:
            conditions.append("lot_status = :status")
            params["status"] = status

    sql = "SELECT * FROM v_lot_shipment_status"

    # sql = """
    #     SELECT
    #         lot_id,
    #         lot_no,
    #         lot_status,
    #         last_activity,

    #         po_id,
    #         po_number,
    #         po_line_id,
    #         po_qty_total,
    #         po_line_due_date,

    #         customer_id,
    #         customer_name,
    #         customer_code,

    #         part_id,
    #         part_no,
    #         part_name,
    #         part_revision_id,
    #         revision,

    #         lot_po_date,
    #         lot_po_duedate,
    #         planned_qty,
    #         lot_planned_ship_qty,
    #         lot_note,

    #         lot_shipped_qty,
    #         lot_last_ship_date,

    #         progress_percent,

    #         step_id,
    #         receive_input,
    #         accept_input,
    #         reject_input,
    #         step_status,

    #         po_shipped_total,
    #         po_remaining_qty,
    #         lot_shipment_status,

    #         ecar,
    #         icar,

    #         po_days_left,
    #         lot_po_days_left,

    #         part_detail,
    #         part_detail_extra

    #     FROM v_lot_shipment_status
    #     """
    if conditions:
        sql += " WHERE " + " AND ".join(conditions)

    sql += f" ORDER BY {order_col}"

    rows = db.execute(text(sql), params).mappings().all()

    # safe debug
   

    # แปลงเป็น list of dict
    result = [dict(row) for row in rows]
    

    # เช็กขนาด JSON
    # json_bytes = json.dumps(
    #     result,
    #     default=str
    # ).encode("utf-8")

    # print("-----------------------------")
    # print("ROWS:", len(result))
    # print(
    #     f"JSON SIZE: {len(json_bytes) / 1024 / 1024:.2f} MB"
    # )
    # print("-----------------------------")

    return result



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