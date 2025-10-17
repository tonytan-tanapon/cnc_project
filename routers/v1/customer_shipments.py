from __future__ import annotations

from datetime import datetime, date
from typing import List, Optional, Tuple

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict
from sqlalchemy import or_
from sqlalchemy.orm import Session, joinedload

from database import get_db
from models import (
    CustomerShipment,
    CustomerShipmentItem,
    PO,
    POLine,
    ProductionLot,
    Customer,
)

shipment_router = APIRouter(prefix="/customer_shipments", tags=["customer_shipments"])

# ---------- Helpers ----------
def _as_date(v):
    if v is None:
        return None
    if isinstance(v, date) and not isinstance(v, datetime):
        return v
    if isinstance(v, datetime):
        return v.date()
    try:
        return datetime.fromisoformat(str(v)).date()
    except Exception:
        return None

def _paginate(query, page: int, page_size: int) -> Tuple[list[CustomerShipment], int]:
    total = query.count()
    items = query.offset((page - 1) * page_size).limit(page_size).all()
    return items, total


# ============================================================
# 🧭 Schemas
# ============================================================

class CustomerBrief(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    code: str
    name: str


class ShipmentCreate(BaseModel):
    po_id: Optional[int] = None
    ship_to: Optional[str] = None
    carrier: Optional[str] = None
    tracking_no: Optional[str] = None
    package_no: Optional[str] = None
    shipped_at: Optional[datetime] = None
    note: Optional[str] = None


class ShipmentUpdate(BaseModel):
    po_id: Optional[int] = None
    ship_to: Optional[str] = None
    carrier: Optional[str] = None
    tracking_no: Optional[str] = None
    package_no: Optional[str] = None
    shipped_at: Optional[datetime] = None
    note: Optional[str] = None


class ShipmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    po_id: Optional[int] = None
    ship_to: Optional[str] = None
    carrier: Optional[str] = None
    tracking_no: Optional[str] = None
    package_no: Optional[str] = None
    shipped_at: Optional[datetime] = None
    note: Optional[str] = None
    created_at: Optional[datetime] = None

    po_number: Optional[str] = None
    customer_name: Optional[str] = None


class ShipmentItemCreate(BaseModel):
    po_line_id: Optional[int] = None
    lot_id: Optional[int] = None
    qty: float = 0
    note: Optional[str] = None


class ShipmentItemUpdate(BaseModel):
    po_line_id: Optional[int] = None
    lot_id: Optional[int] = None
    qty: Optional[float] = None
    note: Optional[str] = None


class ShipmentItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    shipment_id: int
    po_line_id: Optional[int]
    lot_id: Optional[int]
    qty: float
    note: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    po_number: Optional[str] = None
    part_number: Optional[str] = None
    lot_code: Optional[str] = None


# ============================================================
# 🚚 Keyset endpoint
# ============================================================

@shipment_router.get("/keyset", response_model=dict)
def list_shipments_keyset(
    q: Optional[str] = Query(default=None),
    after_id: Optional[int] = Query(default=None, description="Return items with id < after_id"),
    limit: int = Query(default=100, ge=1, le=500),
    db: Session = Depends(get_db),
):
    query = db.query(CustomerShipment).options(joinedload(CustomerShipment.po))

    if q:
        like = f"%{q}%"
        query = query.filter(CustomerShipment.ship_to.ilike(like))

    query = query.order_by(CustomerShipment.id.desc())
    if after_id is not None:
        query = query.filter(CustomerShipment.id < after_id)

    items = query.limit(limit).all()
    data = [ShipmentOut.model_validate(i) for i in items]

    next_cursor = data[-1].id if data else None
    has_more = len(data) == limit
    return {
        "items": data,
        "next_cursor": next_cursor,
        "has_more": has_more,
        "limit": limit,
    }


# ============================================================
# 🧾 Shipment CRUD
# ============================================================

@shipment_router.get("/", response_model=dict)
def list_shipments(
    q: Optional[str] = Query(default=None),
    page: int = 1,
    page_size: int = 100,
    db: Session = Depends(get_db),
):
    query = db.query(CustomerShipment).options(joinedload(CustomerShipment.po))
    if q:
        like = f"%{q}%"
        query = query.filter(CustomerShipment.ship_to.ilike(like))
    items, total = _paginate(query.order_by(CustomerShipment.id.desc()), page, page_size)
    data = [ShipmentOut.model_validate(i) for i in items]
    return {"items": data, "total": total, "page": page, "page_size": page_size}


@shipment_router.post("/", response_model=ShipmentOut, status_code=201)
def create_shipment(payload: ShipmentCreate, db: Session = Depends(get_db)):
    po = db.query(PO).get(payload.po_id) if payload.po_id else None
    if payload.po_id and not po:
        raise HTTPException(404, "PO not found")

    obj = CustomerShipment(**payload.model_dump())
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return ShipmentOut.model_validate(obj)


@shipment_router.patch("/{shipment_id}", response_model=ShipmentOut)
def update_shipment(shipment_id: int, payload: ShipmentUpdate, db: Session = Depends(get_db)):
    obj = db.query(CustomerShipment).get(shipment_id)
    if not obj:
        raise HTTPException(404, "Shipment not found")

    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(obj, k, v)
    db.commit()
    db.refresh(obj)
    return ShipmentOut.model_validate(obj)


@shipment_router.get("/{shipment_id}", response_model=ShipmentOut)
def get_shipment(shipment_id: int, db: Session = Depends(get_db)):
    obj = db.query(CustomerShipment).get(shipment_id)
    if not obj:
        raise HTTPException(404, "Shipment not found")
    return ShipmentOut.model_validate(obj)


@shipment_router.delete("/{shipment_id}", status_code=204)
def delete_shipment(shipment_id: int, db: Session = Depends(get_db)):
    obj = db.query(CustomerShipment).get(shipment_id)
    if not obj:
        raise HTTPException(404, "Shipment not found")
    db.delete(obj)
    db.commit()
    return None


# ============================================================
# 📦 Shipment Items CRUD
# ============================================================

@shipment_router.get("/{shipment_id}/items", response_model=List[ShipmentItemOut])
def list_items(shipment_id: int, db: Session = Depends(get_db)):
    shipment = db.query(CustomerShipment).get(shipment_id)
    if not shipment:
        raise HTTPException(404, "Shipment not found")

    rows = (
        db.query(CustomerShipmentItem)
        .options(joinedload(CustomerShipmentItem.po_line), joinedload(CustomerShipmentItem.lot))
        .filter(CustomerShipmentItem.shipment_id == shipment_id)
        .order_by(CustomerShipmentItem.id)
        .all()
    )
    return [ShipmentItemOut.model_validate(r) for r in rows]


@shipment_router.post("/{shipment_id}/items", response_model=ShipmentItemOut, status_code=201)
def create_item(shipment_id: int, payload: ShipmentItemCreate, db: Session = Depends(get_db)):
    shipment = db.query(CustomerShipment).get(shipment_id)
    if not shipment:
        raise HTTPException(404, "Shipment not found")

    po_line = db.query(POLine).get(payload.po_line_id)
    if not po_line:
        raise HTTPException(404, "PO line not found")

    lot = db.query(ProductionLot).get(payload.lot_id)
    if not lot:
        raise HTTPException(404, "Production lot not found")

    item = CustomerShipmentItem(
        shipment_id=shipment.id,
        po_line_id=payload.po_line_id,
        lot_id=payload.lot_id,
        qty=payload.qty,
        note=payload.note,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return ShipmentItemOut.model_validate(item)


@shipment_router.patch("/items/{item_id}", response_model=ShipmentItemOut)
def update_item(item_id: int, payload: ShipmentItemUpdate, db: Session = Depends(get_db)):
    obj = db.query(CustomerShipmentItem).get(item_id)
    if not obj:
        raise HTTPException(404, "Shipment item not found")

    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(obj, k, v)
    db.commit()
    db.refresh(obj)
    return ShipmentItemOut.model_validate(obj)


@shipment_router.delete("/items/{item_id}", status_code=204)
def delete_item(item_id: int, db: Session = Depends(get_db)):
    obj = db.query(CustomerShipmentItem).get(item_id)
    if not obj:
        raise HTTPException(404, "Shipment item not found")
    db.delete(obj)
    db.commit()
    return None
