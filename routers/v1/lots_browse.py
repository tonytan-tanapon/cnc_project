# routers/lots_browse.py
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_, func
from database import get_db
from models import (
    ProductionLot, Part, PartRevision, PO, Customer, POLine
)

router = APIRouter(prefix="/lots", tags=["lots"])

@router.get("/browse", response_model=dict)
def browse_lots(
    q: Optional[str] = Query(None, description="search in part_no/name/po_no/lot_no/customer_code"),
    page: int = Query(1, ge=1),
    page_size: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
):
    """ตารางรวมข้อมูลตามคอลัมน์ที่ต้องการ"""
    # base query + joins
    qry = (
        db.query(
            ProductionLot.id.label("lot_id"),
            ProductionLot.lot_no.label("lot_no"),
            ProductionLot.started_at.label("lot_start"),
            ProductionLot.lot_due_date.label("lot_due_date"),

            Part.id.label("part_id"),
            Part.part_no.label("part_no"),
            Part.name.label("part_name"),

            PartRevision.rev.label("revision"),

            PO.id.label("po_id"),
            PO.po_number.label("po_no"),

            Customer.code.label("customer_code"),

            POLine.due_date.label("po_due_date"),
        )
        .join(Part, Part.id == ProductionLot.part_id)
        .outerjoin(PartRevision, PartRevision.id == ProductionLot.part_revision_id)
        .outerjoin(PO, PO.id == ProductionLot.po_id)
        .outerjoin(Customer, Customer.id == PO.customer_id)
        .outerjoin(POLine, POLine.id == ProductionLot.po_line_id)
    )

    if q and q.strip():
        like = f"%{q.strip()}%"
        qry = qry.filter(
            or_(
                Part.part_no.ilike(like),
                Part.name.ilike(like),
                PO.po_number.ilike(like),
                ProductionLot.lot_no.ilike(like),
                func.coalesce(Customer.code, "").ilike(like),
            )
        )

    total = qry.count()

    # จัดเรียง: ล่าสุดก่อน (ปรับได้)
    rows = (
        qry.order_by(ProductionLot.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    items: List[Dict[str, Any]] = []
    for r in rows:
        items.append({
            "lot_id": r.lot_id,
            "lot_no": r.lot_no,
            "lot_start": r.lot_start,
            "lot_due_date": r.lot_due_date,

            "part_id": r.part_id,
            "part_no": r.part_no,
            "part_name": r.part_name,

            "revision": r.revision,

            "po_id": r.po_id,
            "po_no": r.po_no,

            "customer_code": r.customer_code,

            "po_due_date": r.po_due_date,
        })

    return {"items": items, "total": total, "page": page, "page_size": page_size}
