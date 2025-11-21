# routers/data_detail.py
from typing import Optional, List
from fastapi import APIRouter, Depends, Query, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import literal, and_
from database import get_db
from models import ProductionLot, PO, Customer, Part, PartRevision, POLine  # CustomerShipmentItem not used here
from datetime import date
from models import ShopTraveler


router = APIRouter(prefix="/data_detail", tags=["lots"])

# ---- response models
class DetailRow(BaseModel):
    lot_id: int
    po_id: Optional[int] = None
    traveler_id: Optional[int] = None  # 👈 NEW FIELD
    lot_no: str
    po_number: Optional[str] = None
    qty: float
    po_due_date: Optional[date] = None
    lot_due_date: Optional[date] = None
    lot_qty: float
    ship_date: Optional[date] = None
    ship_qty: float

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
    part_id: Optional[int] = Query(None, description="Part.id"),
    customer_id: Optional[int] = Query(None, description="Customer.id (PO.customer_id)"),
    revision_id: Optional[int] = Query(None, description="PartRevision.id (preferred)"),
    rev: Optional[str] = Query(None, description="Revision code (e.g. 'A')"),
    after_id: Optional[int] = Query(None, description="Keyset cursor: ProductionLot.id > after_id"),  # ⭐ added
    db: Session = Depends(get_db),
):
    """
    Loads lots + PO + due dates + traveler + optional filters.
    Supports keyset pagination via 'after_id'.
    """

    # --- Columns (safe fallback version)
    lot_no_col  = _pick_col(ProductionLot, "lot_no", default=literal(""))
    po_num_col  = _pick_col(PO, "po_number", default=literal(""))
    qty_col     = _pick_col(ProductionLot, "planned_qty", "qty", default=literal(0))
    lot_due_col = _pick_col(ProductionLot, "lot_due_date", "production_due_date", "due_date", "planned_due_date", default=literal(None))
    pol_due_col = _pick_col(POLine, "due_date", "promised_date", default=literal(None))

    # --- Base query
    q = (
        db.query(
            ProductionLot.id.label("lot_id"),
            ProductionLot.po_id.label("po_id"),
            lot_no_col,
            po_num_col,
            qty_col,
            lot_due_col,
            pol_due_col,
            ShopTraveler.id.label("traveler_id")
        )
        .join(PO, ProductionLot.po_id == PO.id)
        .outerjoin(ShopTraveler, ShopTraveler.lot_id == ProductionLot.id)
    )

    # ---- Filters ----
    if part_id is not None:
        q = q.filter(ProductionLot.part_id == part_id)

    if customer_id is not None:
        q = q.filter(PO.customer_id == customer_id)

    if after_id is not None:                     # ⭐ KEYSET PAGING
        q = q.filter(ProductionLot.id > after_id)

    # --- POLine join logic ---
    on_clauses = []
    pl_po_line_id = getattr(ProductionLot, "po_line_id", None)

    if pl_po_line_id is not None:
        on_clauses = [pl_po_line_id == POLine.id]
    else:
        on_clauses = [POLine.po_id == PO.id]
        if getattr(POLine, "part_id", None) is not None:
            on_clauses.append(POLine.part_id == ProductionLot.part_id)
        if getattr(POLine, "part_revision_id", None) is not None:
            on_clauses.append(POLine.part_revision_id == ProductionLot.part_revision_id)

    if on_clauses:
        q = q.outerjoin(POLine, and_(*on_clauses))

    # --- Revision filter ---
    if revision_id:
        q = q.filter(ProductionLot.part_revision_id == revision_id)
    elif rev:
        q = (
            q.join(PartRevision, PartRevision.id == ProductionLot.part_revision_id)
             .filter(PartRevision.rev == rev)
        )

    # --- Keyset requires ASC order ---
    rows = q.order_by(ProductionLot.id.asc()).all()

    # --- Build response items ---
    items: List[DetailRow] = []
    for (lot_id, po_id, lot_no, po_number, qty, lot_due_date, po_due_date, traveler_id) in rows:
        items.append(DetailRow(
            lot_id=lot_id,
            po_id=po_id,
            traveler_id=traveler_id,
            lot_no=str(lot_no or ""),
            po_number=str(po_number or "") if po_number else None,
            qty=float(qty or 0),
            po_due_date=_as_date(po_due_date),
            lot_due_date=_as_date(lot_due_date),
            lot_qty=float(qty or 0),
            ship_date=None,
            ship_qty=0.0
        ))

    # --- meta (optional for header info) ---
    meta = DetailMeta(part=None, customer=None, revision=None)

    if part_id:
        part = db.query(Part).filter(Part.id == part_id).first()
        if part:
            meta.part = {"id": part.id, "part_no": part.part_no, "name": part.name}

    if customer_id:
        cust = db.query(Customer).filter(Customer.id == customer_id).first()
        if cust:
            meta.customer = {"id": cust.id, "code": cust.code, "name": cust.name}

    if revision_id:
        rev_obj = db.query(PartRevision).filter(PartRevision.id == revision_id).first()
        if rev_obj:
            meta.revision = {
                "id": rev_obj.id,
                "rev": rev_obj.rev,
                "is_current": bool(getattr(rev_obj, "is_current", False))
            }

    return DetailOut(items=items, count=len(items), meta=meta)
