# routers/data_detail.py
from typing import Optional, List
from fastapi import APIRouter, Depends, Query, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import literal
from database import get_db
from models import ProductionLot, PO, Customer, Part, PartRevision
from datetime import date

router = APIRouter(prefix="/data_detail", tags=["lots"])

# ---- response models
class DetailRow(BaseModel):
    lot_no: str
    po_number: Optional[str] = None
    qty: float
    lot_due_date: Optional[date] = None  # <--- rename this

class DetailMeta(BaseModel):
    part: Optional[dict] = None
    revision: Optional[dict] = None
    customer: Optional[dict] = None

class DetailOut(BaseModel):
    items: List[DetailRow]
    count: int
    meta: Optional[DetailMeta] = None


def _pick_col(model, *names, default=None):
    """
    Return the first attribute present on `model` from `names`, else `default`.
    Example: _pick_col(ProductionLot, "production_due_date", "due_date", default=literal(None))
    """
    for n in names:
        col = getattr(model, n, None)
        if col is not None:
            return col
    return default


@router.get("", response_model=DetailOut,
            summary="Lot No, PO No, Qty, Due Date filtered by part/customer/revision + header meta")
def data_detail(
    part_id: int = Query(..., description="Part.id"),
    customer_id: int = Query(..., description="Customer.id (PO.customer_id)"),
    revision_id: Optional[int] = Query(None, description="PartRevision.id (preferred)"),
    rev: Optional[str] = Query(None, description="Revision code (e.g. 'A')"),
    db: Session = Depends(get_db),
):
    due_col = _pick_col(
        ProductionLot,
        "lot_due_date",           # <— NEW preferred
        "production_due_date",    # legacy name you tried
        "due_date",
        "planned_due_date",
        default=literal(None)
    )

    qty_col = _pick_col(ProductionLot, "planned_qty", "qty", default=literal(0))
    lot_no_col = _pick_col(ProductionLot, "lot_no", default=literal(""))
    po_num_col = _pick_col(PO, "po_number", default=literal(""))

    q = (
        db.query(
            lot_no_col,
            po_num_col,
            qty_col,
            due_col,
        )
        .join(PO, ProductionLot.po_id == PO.id)
        .filter(
            ProductionLot.part_id == part_id,
            PO.customer_id == customer_id,
        )
    )

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
    for (lot_no, po_number, qty, lot_due_date) in rows:
        items.append(DetailRow(
            lot_no=str(lot_no or ""),
            po_number=str(po_number or "") if po_number is not None else None,
            qty=float(qty or 0),
            lot_due_date=lot_due_date   # <--- matches new field name
        ))

    print(items)
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
