# routers/data.py  (fast paged list with joined data; no N+1 lookups)
from typing import List, Optional, Dict, Tuple
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session, joinedload


# routers/v1/data.py  (add this)

from pydantic import BaseModel
from sqlalchemy import and_

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


@router.get("", summary="Paged lots with PO/Customer/Part + qty_po aggregated")
def list_lots(
    q: Optional[str] = Query(default=None, description="filter by lot_no (ILIKE)"),
    page: int = Query(1, ge=1),
    page_size: int = Query(100, ge=1, le=500),
    all: bool = Query(False),
    db: Session = Depends(get_db),
):
    page = _normalize_page(page)
    page_size = _normalize_size(page_size)

    base_q = db.query(ProductionLot)
    if q:
        like = f"%{q}%"
        base_q = base_q.filter(ProductionLot.lot_no.ilike(like))

    total = base_q.count()

    if all:
        lots: List[ProductionLot] = base_q.order_by(ProductionLot.id.desc()).all()
        page = 1
        page_size = len(lots)
    else:
        lots = (
            base_q.order_by(ProductionLot.id.desc())
                  .offset((page - 1) * page_size)
                  .limit(page_size)
                  .all()
        )

    if not lots:
        return {"items": [], "total": total, "page": page, "page_size": page_size}

    po_ids   = {l.po_id   for l in lots if l.po_id}
    part_ids = {l.part_id for l in lots if l.part_id}
    rev_ids  = {l.part_revision_id for l in lots if l.part_revision_id}

    # qty_po aggregated once for visible rows
    qty_map: Dict[Tuple[int, int], float] = {}
    if po_ids and part_ids:
        agg_rows = (
            db.query(POLine.po_id, POLine.part_id, func.sum(POLine.qty_ordered).label("qty"))
              .filter(POLine.po_id.in_(po_ids), POLine.part_id.in_(part_ids))
              .group_by(POLine.po_id, POLine.part_id)
              .all()
        )
        qty_map = {(po_id, part_id): float(qty or 0) for po_id, part_id, qty in agg_rows}

    # batch POs (+ customer)
    po_map: Dict[int, PO] = {}
    if po_ids:
        for p in (
            db.query(PO)
              .options(joinedload(PO.customer))
              .filter(PO.id.in_(po_ids))
              .all()
        ):
            po_map[p.id] = p

    # batch parts
    part_map: Dict[int, Part] = {}
    if part_ids:
        for p in db.query(Part).filter(Part.id.in_(part_ids)).all():
            part_map[p.id] = p

    # batch revisions
    rev_map: Dict[int, PartRevision] = {}
    if rev_ids:
        for r in db.query(PartRevision).filter(PartRevision.id.in_(rev_ids)).all():
            rev_map[r.id] = r

    items = []
    for l in lots:
        po    = po_map.get(l.po_id)
        part  = part_map.get(l.part_id)
        rev   = rev_map.get(l.part_revision_id)
        items.append({
            "id": l.id,
            "lot_no": l.lot_no,
            "planned_qty": float(l.planned_qty or 0),
            "status": l.status,
            "created_at": l.created_at,

            "po_id": l.po_id,
            "po_number": (po.po_number if po else None),
            "po_date": None,  # PO model has no created_at/po_date; keep None or add a date field to PO
            "customer_code": (po.customer.code if po and po.customer else None),

            "part_id": l.part_id,
            "part_no": (part.part_no if part else None),

            "part_revision_id": l.part_revision_id,
            "part_rev": (rev.rev if rev else None),

            "qty_po": qty_map.get((l.po_id, l.part_id)),

            "customer_id": (po.customer.id if po and po.customer else None),
            "part_revision_id": l.part_revision_id,
        })

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