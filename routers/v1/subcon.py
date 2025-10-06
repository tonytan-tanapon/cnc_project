from datetime import datetime
from decimal import Decimal
from typing import List, Optional, Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func, text
from datetime import datetime
from database import get_db
from models import (
    Supplier,
    ShopTravelerStep,
    SubconOrder, SubconOrderLine,
    SubconShipment, SubconShipmentItem,
    SubconReceipt, SubconReceiptItem,
)
from schemas import (
    SubconOrderCreate, SubconOrderUpdate, SubconOrderOut,
    SubconShipmentCreate, SubconShipmentOut,
    SubconReceiptCreate, SubconReceiptOut,
)

router = APIRouter(prefix="/subcon", tags=["subcontracting"])


# ---------- Helper: Auto RefNo ----------
def next_ref_no_yearly(db: Session) -> str:
    yymm = datetime.now().strftime("%y%m")
    prefix = f"SC-{yymm}-"

    last = (
        db.query(SubconOrder.ref_no)
        .filter(SubconOrder.ref_no.like(f"{prefix}%"))
        .order_by(SubconOrder.ref_no.desc())
        .limit(1)
        .scalar()
    )

    if last:
        num = int(last.split("-")[-1]) + 1
    else:
        num = 1
    return f"{prefix}{num:03d}"
# ---------- helpers ----------
def _assert_supplier_exists(db: Session, supplier_id: int):
    if not db.get(Supplier, supplier_id):
        raise HTTPException(404, "Supplier not found")


def _assert_step_exists(db: Session, step_id: int):
    if not db.get(ShopTravelerStep, step_id):
        raise HTTPException(404, f"Traveler step {step_id} not found")


# ---------- keyset for JS infinite scroll ----------
@router.get("/keyset")
def keyset_orders(
    q: Optional[str] = Query(default=None),
    after_id: Optional[int] = Query(default=None),
    limit: int = Query(default=500, ge=1, le=2000),
    db: Session = Depends(get_db),
):
    base = db.query(SubconOrder).join(Supplier, Supplier.id == SubconOrder.supplier_id, isouter=True)

    if q:
        like = f"%{q.strip()}%"
        base = base.filter(
            or_(
                SubconOrder.ref_no.ilike(like),
                Supplier.code.ilike(like),
                Supplier.name.ilike(like),
                SubconOrder.status.ilike(like),
            )
        )

    if after_id:
        base = base.filter(SubconOrder.id > after_id)

    rows = (
        base.options(joinedload(SubconOrder.supplier))
        .order_by(SubconOrder.id.asc())
        .limit(limit + 1)
        .all()
    )

    has_more = len(rows) > limit
    items = rows[:limit]
    next_cursor = items[-1].id if has_more else None

    for o in items:
        _ = o.supplier
        _ = o.lines

    return {"items": items, "has_more": has_more, "next_cursor": next_cursor}


# ---------- Orders ----------
@router.post("/orders", response_model=SubconOrderOut)
def create_subcon_order(payload: SubconOrderCreate, db: Session = Depends(get_db)):
    _assert_supplier_exists(db, payload.supplier_id)
    for line in payload.lines:
        _assert_step_exists(db, line.traveler_step_id)

    ref_no = payload.ref_no or next_ref_no_yearly(db)

    order = SubconOrder(
        supplier_id=payload.supplier_id,
        ref_no=ref_no,
        due_date=payload.due_date,
        notes=payload.notes,
        status="open",
    )
    db.add(order)
    db.flush()

    for line in payload.lines:
        db.add(
            SubconOrderLine(
                order_id=order.id,
                traveler_step_id=line.traveler_step_id,
                qty_planned=line.qty_planned,
                unit_cost=line.unit_cost,
            )
        )

    db.commit()
    db.refresh(order)
    _ = order.supplier
    _ = order.lines
    return order



@router.get("/orders", response_model=List[SubconOrderOut])
def list_subcon_orders(
    status: Optional[str] = None,
    supplier_id: Optional[int] = None,
    db: Session = Depends(get_db),
):
    q = db.query(SubconOrder)
    if status:
        q = q.filter(SubconOrder.status == status)
    if supplier_id:
        q = q.filter(SubconOrder.supplier_id == supplier_id)
    items = q.order_by(SubconOrder.created_at.desc()).all()
    for o in items:
        _ = o.lines
        _ = o.supplier
    return items


@router.get("/orders/{order_id}", response_model=SubconOrderOut)
def get_subcon_order(order_id: int, db: Session = Depends(get_db)):
    o = db.get(SubconOrder, order_id)
    if not o:
        raise HTTPException(404, "Subcon order not found")
    _ = o.lines
    _ = o.supplier
    return o


@router.put("/orders/{order_id}", response_model=SubconOrderOut)
def update_subcon_order(order_id: int, payload: SubconOrderUpdate, db: Session = Depends(get_db)):
    o = db.get(SubconOrder, order_id)
    if not o:
        raise HTTPException(404, "Subcon order not found")

    data = payload.dict(exclude_unset=True)
    if "supplier_id" in data and data["supplier_id"] is not None:
        _assert_supplier_exists(db, data["supplier_id"])

    for k, v in data.items():
        setattr(o, k, v)

    db.commit()
    db.refresh(o)
    _ = o.lines
    _ = o.supplier
    return o
