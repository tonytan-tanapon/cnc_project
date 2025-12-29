from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
from database import get_db

router = APIRouter(prefix="/lot-summary", tags=["lot-summary"])

@router.get("/")
def list_lot_summary(
    page: int = 1,
    size: int = 5000,

    sort_by: str = "lot_id",
    sort_dir: str = "asc",

    q: str | None = None,

    # ⭐ filters ใหม่
    part_id: int | None = None,
    revision_id: int | None = None,
    customer_id: int | None = None,
    po_id: int | None = None,

    db: Session = Depends(get_db),
):
    direction = "DESC" if sort_dir.lower() == "desc" else "ASC"

    where = []
    params = {}

    # 🔍 global search
    if q:
        where.append("""
            (
                LOWER(part_no) LIKE LOWER(:q)
                OR LOWER(part_name) LIKE LOWER(:q)
                OR LOWER(lot_no) LIKE LOWER(:q)
                OR LOWER(po_number) LIKE LOWER(:q)
                OR LOWER(customer_code) LIKE LOWER(:q)
            )
        """)
        params["q"] = f"%{q}%"

    # 🎯 filter ตาม lot จริง ๆ
    if part_id is not None:
        where.append("part_id = :part_id")
        params["part_id"] = part_id

    if revision_id is not None:
        where.append("revision_id = :revision_id")
        params["revision_id"] = revision_id

    if customer_id is not None:
        where.append("customer_id = :customer_id")
        params["customer_id"] = customer_id

    if po_id is not None:
        where.append("po_id = :po_id")
        params["po_id"] = po_id

    where_sql = "WHERE " + " AND ".join(where) if where else ""
   
    sql = f"""
        SELECT *
        FROM v_lot_summary
        {where_sql}
        ORDER BY {sort_by} {direction}
        LIMIT :size
        OFFSET :offset
    """

    # sql = f"""
    #     SELECT *
    #     FROM v_lot_shipment_status
    #     {where_sql}
    #     ORDER BY {sort_by} {direction}
    #     LIMIT :size
    #     OFFSET :offset
    # """

    params["size"] = size
    params["offset"] = (page - 1) * size

    rows = db.execute(text(sql), params).mappings().all()

    return {
        "items": rows,
        "page": page,
        "size": size,
        "total": len(rows),
    }
# @router.get("/")
# def list_lot_summary(
#     page: int = 1,
#     size: int = 5000,
#     sort_by: str = "lot_id",
#     sort_dir: str = "asc",
#     q: str | None = None,
#     db: Session = Depends(get_db),
# ):
#     # valid_cols = [
#     #     "lot_id","lot_no","po_number","part_no","customer_code",
#     #     "lot_due_date","po_due_date","ship_date",
#     #     "lot_qty","lot_shipped_qty", "lot_po_date"
#     # ]

#     # if sort_by not in valid_cols:
#     #     sort_by = "lot_id"

#     direction = "DESC" if sort_dir.lower() == "desc" else "ASC"

#     where = []
#     params = {}

#     if q:
#         where.append("""
#             (LOWER(part_no) LIKE LOWER(:q)
#              OR LOWER(part_name) LIKE LOWER(:q)
#              OR LOWER(lot_no) LIKE LOWER(:q)
#              OR LOWER(po_number) LIKE LOWER(:q)
#              OR LOWER(customer_code) LIKE LOWER(:q))
#         """)
#         params["q"] = f"%{q}%"

#     where_sql = "WHERE " + " AND ".join(where) if where else ""

#     sql = f"""
#         SELECT *
#         FROM v_lot_summary
#         {where_sql}
#         ORDER BY {sort_by} {direction}
#         LIMIT :size
#         OFFSET :offset
#     """

#     params["size"] = size
#     params["offset"] = (page - 1) * size

#     rows = db.execute(text(sql), params).mappings().all()
#     print(rows)
#     return {
#         "items": rows,
#         "total": len(rows)
#     }
