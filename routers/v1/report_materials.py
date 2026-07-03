# routers/report_materials.py
from fastapi import APIRouter, Depends, Query, Response
from typing import Optional, List
from sqlalchemy import text
from sqlalchemy.orm import Session
import csv, io

from database import get_db  # <- your SessionLocal provider

router = APIRouter(prefix="/reports/materials", tags=["reports: materials"])

# ---------- Helpers ----------
def paginate_params(skip: int = Query(0, ge=0), limit: int = Query(50, ge=1, le=500)):
    return {"skip": skip, "limit": limit}

# ---------- 1) Material On Hand ----------
@router.get("/on-hand")
def material_on_hand(
    db: Session = Depends(get_db),
    q: Optional[str] = Query(None),
    material_code: Optional[str] = Query(None),
    export: Optional[str] = Query(None, pattern="^(csv)$"),

    sort_field: str = Query("material_code"),
    sort_dir: str = Query("asc"),

    pg = Depends(paginate_params),
):
    """
    GET /reports/materials/on-hand
    Filters:
      - q: free text in code/name
      - material_code: exact match
    Pagination: skip, limit
    export=csv -> CSV file
    """
    where = []
    params = {}

    if material_code:
        where.append("rm.material_code = :material_code")
        params["material_code"] = material_code
    if q:
        where.append("(rm.material_code ILIKE :q OR rm.material_name ILIKE :q)")
        params["q"] = f"%{q}%"

    where_sql = ("WHERE " + " AND ".join(where)) if where else ""

    # -------------------------
    order_map = {
        "material_code": "rm.material_code",
        "material_name": "rm.material_name",
        "total_on_hand": "rm.total_on_hand",
    }

    order_col = order_map.get(sort_field, "rm.material_code")
    direction = "DESC" if sort_dir.lower() == "desc" else "ASC"

    sql = f"""
        SELECT
            rm.material_id,
            rm.material_code,
            rm.material_name,
            rm.total_on_hand

        FROM v_material_on_hand rm

        {where_sql}

        ORDER BY
            {order_col} {direction},
            rm.material_code

        OFFSET :skip
        LIMIT :limit
        """
    params.update(pg)

    rows = db.execute(text(sql), params).mappings().all()

    

    if export == "csv":
        buf = io.StringIO()
        writer = csv.DictWriter(buf, fieldnames=["material_id","material_code","material_name","total_on_hand"])
        writer.writeheader()
        writer.writerows(rows)
        return Response(
            content=buf.getvalue(),
            media_type="text/csv",
            headers={"Content-Disposition": 'attachment; filename="material_on_hand.csv"'}
        )
    return {"items": rows, "count": len(rows), "skip": pg["skip"], "limit": pg["limit"]}


# ---------- 2) Material Batch Ledger ----------
@router.get("/batches")
def material_batch_ledger(
    db: Session = Depends(get_db),
    q: Optional[str] = Query(None, description="search batch_no / material_code / supplier_code / location"),
    material_code: Optional[str] = Query(None),
    supplier_code: Optional[str] = Query(None),
    batch_no: Optional[str] = Query(None),
    location: Optional[str] = Query(None),
    received_from: Optional[str] = Query(None, description="YYYY-MM-DD"),
    received_to: Optional[str] = Query(None, description="YYYY-MM-DD"),
    export: Optional[str] = Query(None, pattern="^(csv)$"),

    sort_field: str = Query("printed"),
    sort_dir: str = Query("asc"),

    pg=Depends(paginate_params),
):
    
    
    where = []
    params = {}

    if material_code:
        where.append("v.material_code = :material_code")
        params["material_code"] = material_code

    if supplier_code:
        where.append("v.supplier_code = :supplier_code")
        params["supplier_code"] = supplier_code

    if batch_no:
        where.append("v.batch_no = :batch_no")
        params["batch_no"] = batch_no

    if location:
        where.append("v.location = :location")
        params["location"] = location

    if received_from:
        where.append("v.received_at >= :received_from::date")
        params["received_from"] = received_from

    if received_to:
        where.append("v.received_at <= :received_to::date")
        params["received_to"] = received_to

    if q:
        where.append("""
        (
            v.batch_no ILIKE :q
            OR v.material_code ILIKE :q
            OR COALESCE(v.supplier_code,'') ILIKE :q
            OR COALESCE(v.location,'') ILIKE :q
            OR COALESCE(v.part_list,'') ILIKE :q
            OR COALESCE(v.po_list,'') ILIKE :q
            OR COALESCE(v.lot_list,'') ILIKE :q
        )
        """)
        params["q"] = f"%{q}%"

    where_sql = "WHERE " + " AND ".join(where) if where else ""

    # -------------------------
    # Sorting
    # -------------------------
    order_map = {
        "printed": "COALESCE(v.printed,false)",
        "batch_no": "v.batch_no",
        "material_id": "v.material_id",
        "supplier_id": "v.supplier_id",
        "size_text": "v.size_text",
        "length_text": "v.length_text",
        "location": "v.location",
        "received_at": "v.received_at",
    }

    order_col = order_map.get(sort_field, "COALESCE(v.printed,false)")
    direction = "DESC" if sort_dir.lower() == "desc" else "ASC"

    


    sql = f"""
    SELECT
        v.batch_id,
        v.batch_no,

        v.printed,

        v.part_list,
        v.rev_list,
        v.po_list,
        v.lot_list,

        v.size_text,
        v.length_text,
        v.heat_lot,

        v.material_id,
        v.material_code,
        v.material_name,
        v.material_type,
        v.material_spec,

        v.supplier_id,
        v.supplier_code,

        v.received_at,
        v.qty_received,
        v.qty_used,
        v.qty_available,
        v.location

    FROM v_material_batch_ledger v

    {where_sql}

    ORDER BY
        {order_col} {direction},
        v.batch_no DESC

    OFFSET :skip
    LIMIT :limit
    """
    
    params.update(pg)

    rows = db.execute(text(sql), params).mappings().all()

   

    if export == "csv":

        buf = io.StringIO()

        writer = csv.DictWriter(
            buf,
            fieldnames=[
                "batch_id",
                "batch_no",
                "printed",
                "part_list",
                "rev_list",
                "po_list",
                "lot_list",
                "size_text",
                "length_text",
                "heat_lot",
                "material_code",
                "material_name",
                "material_type",
                "material_spec",
                "supplier_code",
                "received_at",
                "qty_received",
                "qty_used",
                "qty_available",
                "location",
            ],
        )

        writer.writeheader()
        writer.writerows(rows)

        return Response(
            content=buf.getvalue(),
            media_type="text/csv",
            headers={
                "Content-Disposition":
                'attachment; filename="material_batch_ledger.csv"'
            },
        )

    return {
        "items": rows,
        "count": len(rows),
        "skip": pg["skip"],
        "limit": pg["limit"],
    }