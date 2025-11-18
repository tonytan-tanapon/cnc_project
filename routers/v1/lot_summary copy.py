from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
from database import get_db

router = APIRouter(prefix="/lot-summary", tags=["lot-summary"])

@router.get("/")
def list_lot_summary(
    limit: int = Query(200, ge=1, le=500),
    after_value: str | None = None,
    after_lot_id: int | None = None,
    sort_by: str | None = None,
    sort_dir: str = "asc",
    q: str | None = None,
    db: Session = Depends(get_db),
):
    # valid sort columns + type
    sort_map = {
        "lot_id": ("lot_id", "numeric"),
        "lot_no": ("lot_no", "text"),
        "po_number": ("po_number", "text"),
        "part_no": ("part_no", "text"),
        "customer_code": ("customer_code", "text"),

        "lot_due_date": ("lot_due_date", "date"),
        "po_due_date": ("po_due_date", "date"),
        "ship_date": ("ship_date", "date"),

        "lot_qty": ("lot_qty", "numeric"),
        "ship_qty": ("ship_qty", "numeric"),
    }

    # default sort
    order_col, col_type = sort_map.get(sort_by, ("lot_id", "numeric"))
    direction = "DESC" if sort_dir.lower() == "desc" else "ASC"

    where_parts = []
    params = {"limit": limit}

    # -------- Keyset Cursor --------
    if after_value is not None and after_lot_id is not None:

        # --- cast value by type ---
        if col_type == "numeric":
            try:
                after_value = float(after_value)
            except:
                after_value = 0

        elif col_type == "date":
            after_value = str(after_value)

        else:  # text
            after_value = str(after_value)

        params["after_value"] = after_value
        params["after_lot_id"] = after_lot_id

        # --- SQL tuple compare ---
        if col_type == "text":
            where_parts.append(
                f"({order_col}::text, lot_id) > (:after_value::text, :after_lot_id)"
            )

        elif col_type == "date":
            where_parts.append(
                f"({order_col}, lot_id) > (CAST(:after_value AS date), :after_lot_id)"
            )

        else:  # numeric
            where_parts.append(
                f"({order_col}, lot_id) > (:after_value::numeric, :after_lot_id)"
            )

    # -------- Search --------
    if q:
        where_parts.append("""
            (LOWER(part_no) LIKE LOWER(:q)
             OR LOWER(part_name) LIKE LOWER(:q)
             OR LOWER(lot_no) LIKE LOWER(:q)
             OR LOWER(po_number) LIKE LOWER(:q)
             OR LOWER(customer_code) LIKE LOWER(:q))
        """)
        params["q"] = f"%{q}%"

    # Build WHERE
    where_sql = "WHERE " + " AND ".join(where_parts) if where_parts else ""

    # -------- Final SQL --------
    sql = f"""
        SELECT *
        FROM v_lot_summary
        {where_sql}
        ORDER BY {order_col} {direction}, lot_id ASC
        LIMIT :limit
    """

    rows = db.execute(text(sql), params).mappings().all()
    return {"items": rows}
