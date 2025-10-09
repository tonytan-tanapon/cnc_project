# routers/data_detail.py
from typing import Optional, List
from fastapi import APIRouter, Depends, Query, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import literal, and_
from database import get_db
from models import ProductionLot, PO, Customer, Part, PartRevision, POLine  # CustomerShipmentItem not used here
from datetime import date

router = APIRouter(prefix="/data_detail", tags=["lots"])

# ---- response models
class DetailRow(BaseModel):
    lot_no: str
    po_number: Optional[str] = None
    qty: float
    po_due_date: Optional[date] = None     # from POLine.due_date (or fallback)
    lot_due_date: Optional[date] = None    # from ProductionLot.lot_due_date (or fallback)
    lot_qty: float                          # echo qty for now (or map to a dedicated column if you have one)
    ship_date: Optional[date] = None        # placeholder until you wire shipments
    ship_qty: float                         # placeholder until you wire shipments

class DetailMeta(BaseModel):
    part: Optional[dict] = None
    revision: Optional[dict] = None
    customer: Optional[dict] = None

class DetailOut(BaseModel):
    items: List[DetailRow]
    count: int
    meta: Optional[DetailMeta] = None

# routers/v1/data_detail.py
from datetime import date, datetime

def _as_date(v):
    if v is None:
        return None
    if isinstance(v, date) and not isinstance(v, datetime):
        return v
    if isinstance(v, datetime):
        return v.date()
    try:
        # handles 'YYYY-MM-DD' or ISO strings
        return datetime.fromisoformat(str(v)).date()
    except Exception:
        return None
def _pick_col(model, *names, default=None):
    """
    Return the first attribute present on `model` from `names`, else `default`.
    Example: _pick_col(ProductionLot, "lot_due_date", "due_date", default=literal(None))
    """
    for n in names:
        col = getattr(model, n, None)
        if col is not None:
            return col
    return default


@router.get("", response_model=DetailOut,
            summary="Lot No, PO No, Qty, PO/LOT Due Dates filtered by part/customer/revision + header meta")
def data_detail(
    part_id: int = Query(..., description="Part.id"),
    customer_id: int = Query(..., description="Customer.id (PO.customer_id)"),
    revision_id: Optional[int] = Query(None, description="PartRevision.id (preferred)"),
    rev: Optional[str] = Query(None, description="Revision code (e.g. 'A')"),
    db: Session = Depends(get_db),
):
    if not part_id or not customer_id:
        raise HTTPException(status_code=400, detail="part_id and customer_id are required")

    # Resolve columns (with safe fallbacks)
    lot_no_col   = _pick_col(ProductionLot, "lot_no", default=literal(""))
    po_num_col   = _pick_col(PO,           "po_number", default=literal(""))
    qty_col      = _pick_col(ProductionLot, "planned_qty", "qty", default=literal(0))
    lot_due_col  = _pick_col(ProductionLot, "lot_due_date", "production_due_date", "due_date", "planned_due_date", default=literal(None))
    # POLine due date (what you asked for)
    pol_due_col  = _pick_col(POLine, "due_date", "promised_date", default=literal(None))

    # Base query Lot -> PO (inner join to enforce customer filter)
    q = (
        db.query(
            lot_no_col,      # 0
            po_num_col,      # 1
            qty_col,         # 2
            lot_due_col,     # 3 (lot-level due date)
            pol_due_col,     # 4 (PO line due date)
        )
        .join(PO, ProductionLot.po_id == PO.id)
        .filter(
            ProductionLot.part_id == part_id,
            PO.customer_id == customer_id,
        )
    )

    # Prefer joining POLine via ProductionLot.po_line_id if available;
    # otherwise, fall back to PO.id + part_id (+ part_revision_id if both present).
    on_clauses = []
    pl_po_line_id = getattr(ProductionLot, "po_line_id", None)
    if pl_po_line_id is not None:
        on_clauses = [pl_po_line_id == POLine.id]
    else:
        # always safe: link POLine to PO
        on_clauses = [POLine.po_id == PO.id]
        # refine by part if both sides have it
        if getattr(POLine, "part_id", None) is not None and getattr(ProductionLot, "part_id", None) is not None:
            on_clauses.append(POLine.part_id == ProductionLot.part_id)
        # refine by revision if both sides have it
        if getattr(POLine, "part_revision_id", None) is not None and getattr(ProductionLot, "part_revision_id", None) is not None:
            on_clauses.append(POLine.part_revision_id == ProductionLot.part_revision_id)

    if on_clauses:
        q = q.outerjoin(POLine, and_(*on_clauses))  # outer join so rows still appear if no matching POLine

    # Revision filter (prefer id, else rev code)
    if revision_id is not None:
        q = q.filter(ProductionLot.part_revision_id == revision_id)
    elif rev is not None:
        q = (
            q.join(PartRevision, PartRevision.id == ProductionLot.part_revision_id)
             .filter(
                 PartRevision.part_id == part_id,
                 PartRevision.rev == rev,
             )
        )

    rows = q.order_by(PO.id.desc(), ProductionLot.id.desc()).all()

    items: List[DetailRow] = []
    for (lot_no, po_number, qty, lot_due_date, po_due_date) in rows:
        # For now, we set lot_qty = qty, and leave shipping placeholders (wire later if needed)
        items.append(DetailRow(
            lot_no=str(lot_no or ""),
            po_number=str(po_number or "") if po_number is not None else None,
            qty=float(qty or 0),
            po_due_date=_as_date(po_due_date),
            lot_due_date=_as_date(lot_due_date),
            lot_qty=float(qty or 0),
            ship_date=None,
            ship_qty=0.0
        ))

    # ---- meta for header
    part = db.query(Part).filter(Part.id == part_id).first()
    cust = db.query(Customer).filter(Customer.id == customer_id).first()

    rev_obj = None
    if revision_id is not None:
        rev_obj = db.query(PartRevision).filter(PartRevision.id == revision_id).first()
    elif rev is not None:
        rev_obj = db.query(PartRevision).filter(
            PartRevision.part_id == part_id, PartRevision.rev == rev
        ).first()
    else:
        rev_obj = db.query(PartRevision).filter(
            PartRevision.part_id == part_id, PartRevision.is_current == True
        ).first()

    meta = DetailMeta(
        part={"id": part.id, "part_no": part.part_no, "name": part.name} if part else None,
        customer={"id": cust.id, "code": cust.code, "name": cust.name} if cust else None,
        revision={"id": rev_obj.id, "rev": rev_obj.rev, "is_current": bool(getattr(rev_obj, "is_current", False))} if rev_obj else None,
    )

    return DetailOut(items=items, count=len(items), meta=meta)
