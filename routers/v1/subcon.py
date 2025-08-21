# routers/subcon.py
from datetime import datetime
from decimal import Decimal
from typing import List, Optional, Literal

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

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


# ---------- helpers ----------
def _assert_supplier_exists(db: Session, supplier_id: int):
    if not db.get(Supplier, supplier_id):
        raise HTTPException(404, "Supplier not found")


def _assert_step_exists(db: Session, step_id: int):
    if not db.get(ShopTravelerStep, step_id):
        raise HTTPException(404, f"Traveler step {step_id} not found")


def _shipped_qty_for_step(db: Session, order_id: int, step_id: int) -> Decimal:
    total = (
        db.query(func.coalesce(func.sum(SubconShipmentItem.qty), 0))
        .join(SubconShipment, SubconShipmentItem.shipment_id == SubconShipment.id)
        .filter(SubconShipment.order_id == order_id, SubconShipmentItem.traveler_step_id == step_id)
        .scalar()
    )
    return Decimal(total)


def _received_qty_for_step(db: Session, order_id: int, step_id: int) -> Decimal:
    total = (
        db.query(func.coalesce(func.sum(SubconReceiptItem.qty_received), 0))
        .join(SubconReceipt, SubconReceiptItem.receipt_id == SubconReceipt.id)
        .filter(SubconReceipt.order_id == order_id, SubconReceiptItem.traveler_step_id == step_id)
        .scalar()
    )
    return Decimal(total)


# ---------- Orders ----------
@router.post("/orders", response_model=SubconOrderOut)
def create_subcon_order(payload: SubconOrderCreate, db: Session = Depends(get_db)):
    _assert_supplier_exists(db, payload.supplier_id)
    for line in payload.lines:
        _assert_step_exists(db, line.traveler_step_id)

    order = SubconOrder(
        supplier_id=payload.supplier_id,
        ref_no=payload.ref_no,
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
    _ = order.lines  # force load for response
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
    return items


@router.get("/orders/{order_id}", response_model=SubconOrderOut)
def get_subcon_order(order_id: int, db: Session = Depends(get_db)):
    o = db.get(SubconOrder, order_id)
    if not o:
        raise HTTPException(404, "Subcon order not found")
    _ = o.lines
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
    return o


# ---------- Shipments ----------
class SubconShipmentUpdate(__import__("pydantic").BaseModel):
    shipped_at: Optional[datetime] = None
    shipped_by: Optional[str] = None
    package_no: Optional[str] = None
    carrier: Optional[str] = None
    tracking_no: Optional[str] = None
    status: Optional[Literal["shipped", "partially_received", "closed"]] = None


@router.post("/shipments", response_model=SubconShipmentOut)
def create_shipment(payload: SubconShipmentCreate, db: Session = Depends(get_db)):
    order = db.get(SubconOrder, payload.order_id)
    if not order:
        raise HTTPException(404, "Subcon order not found")

    order_line_steps = {ol.traveler_step_id for ol in order.lines}
    if not order_line_steps:
        raise HTTPException(400, "Order has no lines; cannot ship")

    sh = SubconShipment(
        order_id=payload.order_id,
        shipped_at=payload.shipped_at or datetime.utcnow(),
        shipped_by=payload.shipped_by,
        package_no=payload.package_no,
        carrier=payload.carrier,
        tracking_no=payload.tracking_no,
        status="shipped",
    )
    db.add(sh)
    db.flush()

    for it in payload.items:
        if it.traveler_step_id not in order_line_steps:
            raise HTTPException(400, f"Step {it.traveler_step_id} is not part of this order")
        if it.qty <= 0:
            raise HTTPException(400, "Shipment qty must be > 0")
        db.add(
            SubconShipmentItem(
                shipment_id=sh.id,
                traveler_step_id=it.traveler_step_id,
                qty=it.qty,
            )
        )

    db.commit()
    db.refresh(sh)
    _ = sh.items
    return sh


@router.get("/shipments", response_model=List[SubconShipmentOut])
def list_shipments(order_id: Optional[int] = None, db: Session = Depends(get_db)):
    q = db.query(SubconShipment)
    if order_id:
        q = q.filter(SubconShipment.order_id == order_id)
    items = q.order_by(SubconShipment.shipped_at.desc()).all()
    for it in items:
        _ = it.items
    return items


@router.get("/shipments/{shipment_id}", response_model=SubconShipmentOut)
def get_shipment(shipment_id: int, db: Session = Depends(get_db)):
    sh = db.get(SubconShipment, shipment_id)
    if not sh:
        raise HTTPException(404, "Shipment not found")
    _ = sh.items
    return sh


@router.put("/shipments/{shipment_id}", response_model=SubconShipmentOut)
def update_shipment(shipment_id: int, payload: SubconShipmentUpdate, db: Session = Depends(get_db)):
    sh = db.get(SubconShipment, shipment_id)
    if not sh:
        raise HTTPException(404, "Shipment not found")

    data = payload.dict(exclude_unset=True)
    for k, v in data.items():
        setattr(sh, k, v)

    db.commit()
    db.refresh(sh)
    _ = sh.items
    return sh


# ---------- Receipts ----------
class SubconReceiptUpdate(__import__("pydantic").BaseModel):
    received_at: Optional[datetime] = None
    received_by: Optional[str] = None
    doc_no: Optional[str] = None
    status: Optional[Literal["received", "partial", "rejected"]] = None


@router.post("/receipts", response_model=SubconReceiptOut)
def create_receipt(payload: SubconReceiptCreate, db: Session = Depends(get_db)):
    order = db.get(SubconOrder, payload.order_id)
    if not order:
        raise HTTPException(404, "Subcon order not found")

    order_line_steps = {ol.traveler_step_id for ol in order.lines}

    rc = SubconReceipt(
        order_id=payload.order_id,
        received_at=payload.received_at or datetime.utcnow(),
        received_by=payload.received_by,
        doc_no=payload.doc_no,
        status="received",
    )
    db.add(rc)
    db.flush()

    for it in payload.items:
        sid = it.traveler_step_id
        if sid not in order_line_steps:
            raise HTTPException(400, f"Step {sid} is not part of this order")

        shipped_total = (
            db.query(func.coalesce(func.sum(SubconShipmentItem.qty), 0))
            .join(SubconShipment, SubconShipmentItem.shipment_id == SubconShipment.id)
            .filter(SubconShipment.order_id == order.id, SubconShipmentItem.traveler_step_id == sid)
            .scalar()
        )
        received_total = (
            db.query(func.coalesce(func.sum(SubconReceiptItem.qty_received), 0))
            .join(SubconReceipt, SubconReceiptItem.receipt_id == SubconReceipt.id)
            .filter(SubconReceipt.order_id == order.id, SubconReceiptItem.traveler_step_id == sid)
            .scalar()
        )

        shipped_total = Decimal(shipped_total or 0)
        received_total = Decimal(received_total or 0)

        if it.qty_received < 0 or it.qty_rejected < 0 or it.scrap_qty < 0:
            raise HTTPException(400, "Quantities must be >= 0")

        if (received_total + Decimal(str(it.qty_received))) > shipped_total:
            raise HTTPException(400, f"Received qty would exceed shipped qty for step {sid}")

        db.add(
            SubconReceiptItem(
                receipt_id=rc.id,
                traveler_step_id=sid,
                qty_received=it.qty_received,
                qty_rejected=it.qty_rejected,
                scrap_qty=it.scrap_qty,
                qa_result=it.qa_result,
                qa_notes=it.qa_notes,
            )
        )

    db.commit()
    db.refresh(rc)
    _ = rc.items
    return rc


@router.get("/receipts", response_model=List[SubconReceiptOut])
def list_receipts(order_id: Optional[int] = None, db: Session = Depends(get_db)):
    q = db.query(SubconReceipt)
    if order_id:
        q = q.filter(SubconReceipt.order_id == order_id)
    items = q.order_by(SubconReceipt.received_at.desc()).all()
    for it in items:
        _ = it.items
    return items


@router.get("/receipts/{receipt_id}", response_model=SubconReceiptOut)
def get_receipt(receipt_id: int, db: Session = Depends(get_db)):
    rc = db.get(SubconReceipt, receipt_id)
    if not rc:
        raise HTTPException(404, "Receipt not found")
    _ = rc.items
    return rc


@router.put("/receipts/{receipt_id}", response_model=SubconReceiptOut)
def update_receipt(receipt_id: int, payload: SubconReceiptUpdate, db: Session = Depends(get_db)):
    rc = db.get(SubconReceipt, receipt_id)
    if not rc:
        raise HTTPException(404, "Receipt not found")

    data = payload.dict(exclude_unset=True)
    for k, v in data.items():
        setattr(rc, k, v)

    db.commit()
    db.refresh(rc)
    _ = rc.items
    return rc
