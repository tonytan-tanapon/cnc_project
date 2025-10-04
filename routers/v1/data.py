# routers/data.py  (fast paged list with joined data; no N+1 lookups)
from typing import List, Optional, Dict, Tuple
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session, joinedload


# routers/v1/data.py  (add this)

from pydantic import BaseModel
from sqlalchemy import and_, or_

from database import get_db
from models import ProductionLot, PO, PartRevision

router = APIRouter(prefix="/data", tags=["lots"])  # you already have this
from sqlalchemy import func

from database import get_db
from models import (
    ProductionLot,
    PO,
    Customer,
    Part,
    PartRevision,
    POLine,
)

router = APIRouter(prefix="/data", tags=["lots"])

def _normalize_page(p: int) -> int:
    try:
        p = int(p)
    except Exception:
        p = 1
    return max(1, p)

def _normalize_size(s: int) -> int:
    try:
        s = int(s)
    except Exception:
        s = 100
    # cap to protect server
    return min(max(1, s), 500)


from sqlalchemy import func, or_

@router.get("", summary="One row per Part (latest lot) + PO/Customer/Part, qty_po aggregated")
def list_lots(
    q: Optional[str] = Query(default=None, description="filter by lot_no or part_no (ILIKE)"),
    page: int = Query(1, ge=1),
    page_size: int = Query(100, ge=1, le=500),
    all: bool = Query(False),
    db: Session = Depends(get_db),
):
    page = _normalize_page(page)
    page_size = _normalize_size(page_size)

    # ---- Subquery: pick ONE representative lot per part (latest by ProductionLot.id)
    rn = func.row_number().over(
        partition_by=ProductionLot.part_id,
        order_by=ProductionLot.id.desc()
    ).label("rn")

    # Select the minimal set of columns we need from the representative lot
    pl_latest_sq = (
        db.query(
            ProductionLot.id.label("id"),
            ProductionLot.lot_no.label("lot_no"),
            ProductionLot.planned_qty.label("planned_qty"),
            ProductionLot.status.label("status"),
            ProductionLot.created_at.label("created_at"),
            ProductionLot.po_id.label("po_id"),
            ProductionLot.part_id.label("part_id"),
            ProductionLot.part_revision_id.label("part_revision_id"),
            rn,
        )
        .subquery("pl_latest_sq")
    )

    # Base query = only rn = 1 rows (=> one row per part)
    base_q = db.query(pl_latest_sq).filter(pl_latest_sq.c.rn == 1)

    # Optional keyword search across lot_no and part_no
    if q:
        like = f"%{q}%"
        base_q = (
            base_q.join(Part, Part.id == pl_latest_sq.c.part_id)
                  .filter(
                      or_(
                          pl_latest_sq.c.lot_no.ilike(like),
                          Part.part_no.ilike(like),
                      )
                  )
        )

    # Count AFTER filters (how many unique parts matched)
    total = base_q.count()

    # Paging
    if all:
        rows = base_q.order_by(pl_latest_sq.c.id.desc()).all()
        page = 1
        page_size = len(rows)
    else:
        rows = (
            base_q.order_by(pl_latest_sq.c.id.desc())
                  .offset((page - 1) * page_size)
                  .limit(page_size)
                  .all()
        )

    if not rows:
        return {"items": [], "total": total, "page": page, "page_size": page_size}

    # Collect ids for batch lookups (preserves your existing enrich pattern)
    po_ids   = {r.po_id for r in rows if r.po_id}
    part_ids = {r.part_id for r in rows if r.part_id}
    rev_ids  = {r.part_revision_id for r in rows if r.part_revision_id}

    # Aggregate qty_po for these visible rows
    qty_map: Dict[Tuple[int, int], float] = {}
    if po_ids and part_ids:
        agg_rows = (
            db.query(POLine.po_id, POLine.part_id, func.sum(POLine.qty_ordered).label("qty"))
              .filter(POLine.po_id.in_(po_ids), POLine.part_id.in_(part_ids))
              .group_by(POLine.po_id, POLine.part_id)
              .all()
        )
        qty_map = {(po_id, part_id): float(qty or 0) for po_id, part_id, qty in agg_rows}

    # Batch POs (+ customer)
    po_map: Dict[int, PO] = {}
    if po_ids:
        for p in (
            db.query(PO)
              .options(joinedload(PO.customer))
              .filter(PO.id.in_(po_ids))
              .all()
        ):
            po_map[p.id] = p

    # Batch Parts
    part_map: Dict[int, Part] = {}
    if part_ids:
        for p in db.query(Part).filter(Part.id.in_(part_ids)).all():
            part_map[p.id] = p

    # Batch Revisions
    rev_map: Dict[int, PartRevision] = {}
    if rev_ids:
        for r in db.query(PartRevision).filter(PartRevision.id.in_(rev_ids)).all():
            rev_map[r.id] = r

    # Build response items (one row per Part)
    items = []
    for r in rows:
        po   = po_map.get(r.po_id)
        part = part_map.get(r.part_id)
        rev  = rev_map.get(r.part_revision_id)
        items.append({
            "id": r.id,                         # representative lot id (latest)
            "lot_no": r.lot_no,
            "planned_qty": float(r.planned_qty or 0),
            "status": r.status,
            "created_at": r.created_at,

            "po_id": r.po_id,
            "po_number": (po.po_number if po else None),
            "po_date": None,
            "customer_code": (po.customer.code if po and po.customer else None),

            "part_id": r.part_id,
            "part_no": (part.part_no if part else None),
            "part_name": (part.name if part else None),

            "part_revision_id": r.part_revision_id,
            "part_rev": (rev.rev if rev else None),

            "qty_po": qty_map.get((r.po_id, r.part_id)),
            "customer_id": (po.customer.id if po and po.customer else None),
        })
    print(items)
    return {"items": items, "total": total, "page": page, "page_size": page_size}



#####

# --- Response schema
class LotPoQtyOut(BaseModel):
    lot_no: str
    po_number: Optional[str]
    qty: float

class LotPoQtyList(BaseModel):
    items: List[LotPoQtyOut]
    count: int

@router.get("/detail", response_model=LotPoQtyList,
            summary="Lot No, PO No, Qty filtered by part/customer/revision")
def lots_by_part_customer_rev(
    part_id: int = Query(..., description="Part.id"),
    customer_id: int = Query(..., description="Customer.id (PO.customer_id)"),
    revision_id: Optional[int] = Query(None, description="PartRevision.id (preferred)"),
    rev: Optional[str] = Query(None, description="Revision code (e.g. 'A')"),
    db: Session = Depends(get_db),
):
    """
    Returns items: [{lot_no, po_number, qty}], where qty = ProductionLot.planned_qty.
    Filters:
      - part_id: required
      - customer_id: required (via PO.customer_id)
      - revision: either revision_id OR rev (code). If both omitted → any revision of that part.
    Only lots linked to a PO are returned (inner join on PO).
    """

    # Base join: Lot -> PO (enforces customer filter) + part_id filter
    q = (
        db.query(
            ProductionLot.lot_no,
            PO.po_number,
            ProductionLot.planned_qty,
        )
        .join(PO, ProductionLot.po_id == PO.id)  # inner join → excludes lots without PO
        .filter(
            ProductionLot.part_id == part_id,
            PO.customer_id == customer_id,
        )
    )

    # Revision filter (prefer id, else rev code)
    if revision_id is not None:
        q = q.filter(ProductionLot.part_revision_id == revision_id)
    elif rev is not None:
        # join to PartRevision to match rev text and ensure it belongs to the same part
        q = (
            q.join(PartRevision, PartRevision.id == ProductionLot.part_revision_id)
             .filter(
                 PartRevision.part_id == part_id,
                 PartRevision.rev == rev,
             )
        )

    rows = (
        q.order_by(PO.id.desc(), ProductionLot.id.desc())
         .all()
    )

    items = [
        LotPoQtyOut(
            lot_no=lot_no,
            po_number=po_number,
            qty=float(qty or 0),
        )
        for (lot_no, po_number, qty) in rows
    ]
    return {"items": items, "count": len(items)}