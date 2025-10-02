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
    q: Optional[str] = Query(None, description="search in material_code/name"),
    material_code: Optional[str] = Query(None),
    export: Optional[str] = Query(None, pattern="^(csv)$"),
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
    sql = f"""
      SELECT rm.material_id, rm.material_code, rm.material_name, rm.total_on_hand
      FROM v_material_on_hand rm
      {where_sql}
      ORDER BY rm.material_code
      OFFSET :skip LIMIT :limit
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
    pg = Depends(paginate_params),
):
    """
    GET /reports/materials/batches
    Filters:
      - q: free text across code/supplier/batch/location
      - material_code, supplier_code, batch_no, location
      - received_from / received_to (inclusive)
    Pagination: skip, limit
    export=csv -> CSV file
    """
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
        where.append("""(
            v.batch_no ILIKE :q OR
            v.material_code ILIKE :q OR
            COALESCE(v.supplier_code,'') ILIKE :q OR
            COALESCE(v.location,'') ILIKE :q
        )""")
        params["q"] = f"%{q}%"

    where_sql = ("WHERE " + " AND ".join(where)) if where else ""
    sql = f"""
      SELECT
        v.batch_id, v.batch_no, v.material_code, v.material_name, v.supplier_code,
        v.received_at, v.qty_received, v.qty_used, v.qty_available, v.location
      FROM v_material_batch_ledger v
      {where_sql}
      ORDER BY v.received_at DESC NULLS LAST, v.batch_no
      OFFSET :skip LIMIT :limit
    """
    params.update(pg)

    rows = db.execute(text(sql), params).mappings().all()

    if export == "csv":
        buf = io.StringIO()
        writer = csv.DictWriter(buf, fieldnames=[
            "batch_id","batch_no","material_code","material_name","supplier_code",
            "received_at","qty_received","qty_used","qty_available","location"
        ])
        writer.writeheader()
        writer.writerows(rows)
        return Response(
            content=buf.getvalue(),
            media_type="text/csv",
            headers={"Content-Disposition": 'attachment; filename="material_batch_ledger.csv"'}
        )
    return {"items": rows, "count": len(rows), "skip": pg["skip"], "limit": pg["limit"]}
