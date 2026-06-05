# routers/v1/ecars.py

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import or_
from datetime import date

from database import get_db

from models import (
    ECAR,
    ProductionLot,
    PO
)

router = APIRouter(
    prefix="/ecars",
    tags=["ECAR"]
)

from pydantic import BaseModel
from typing import Optional
from decimal import Decimal
from datetime import date


class ECARCreate(BaseModel):

    ecar_no: Optional[str] = None

    lot_id: Optional[int] = None

    customer_code: Optional[str] = None
    po_no: Optional[str] = None
    lot_no: Optional[str] = None

    part_no: Optional[str] = None
    part_name: Optional[str] = None
    rev: Optional[str] = None

    issue_date: Optional[date] = None

    shipped_qty: Optional[Decimal] = 0
    rtv_qty: Optional[Decimal] = 0

    customer_rework_qty: Optional[Decimal] = 0

    use_as_is_qty: Optional[Decimal] = 0

    defect_percent: Optional[Decimal] = 0

    discrepancy: Optional[str] = None

    root_cause: Optional[str] = None

    corrective_action: Optional[str] = None

    preventive_action: Optional[str] = None

    remark: Optional[str] = None

    status: Optional[str] = "open"
    date_initiated: Optional[date] = None


class ECARUpdate(ECARCreate):
    pass


def to_row(e: ECAR):

    return {

        "id": e.id,

        "ecar_no": e.ecar_no,

        "issue_date": e.issue_date,
        "date_initiated": e.date_initiated, 

        "customer_code": e.customer_code,

        "po_no": e.po_no,

        "lot_no": e.ncr_rma_job_no,
        "part_name": e.part_description,

        "part_no": e.part_no,


        "rev": e.rev,

        "shipped_qty":
            float(e.shipped_qty or 0),

        "rtv_qty":
            float(e.rtv_qty or 0),

        "customer_rework_qty":
            float(e.customer_rework_qty or 0),

        "use_as_is_qty":
            float(e.use_as_is_qty or 0),

        "defect_percent":
            float(e.defect_percent or 0),

        "remark":
            e.remark,

        "status":
            e.status
    }


@router.get("/keyset")
def list_ecars(
    q: str = "",
    cursor: int | None = None,
    limit: int = Query(200, le=200),
    db: Session = Depends(get_db)
):

    qry = db.query(ECAR)

    if q:

        like = f"%{q}%"

        qry = qry.filter(

            or_(

                ECAR.ecar_no.ilike(like),

                ECAR.customer_code.ilike(like),

                ECAR.po_no.ilike(like),

                ECAR.lot_no.ilike(like),

                ECAR.part_no.ilike(like)

            )

        )

    if cursor:
        qry = qry.filter(
            ECAR.id < cursor
        )

    rows = (
        qry.order_by(ECAR.id.desc())
        .limit(limit + 1)
        .all()
    )

    has_more = len(rows) > limit

    rows = rows[:limit]

    return {

        "items":
            [to_row(r) for r in rows],

        "has_more":
            has_more
    }


@router.post("")
def create_ecar(
    payload: ECARCreate,
    db: Session = Depends(get_db)
):

    row = ECAR()

    for k, v in payload.dict().items():
        setattr(row, k, v)

    if not row.ecar_no:

        last = (
            db.query(ECAR)
            .order_by(ECAR.id.desc())
            .first()
        )

        next_no = 1

        if last and last.ecar_no:

            try:
                next_no = (
                    int(
                        last.ecar_no
                        .replace("ECAR-", "")
                    ) + 1
                )
            except:
                pass

        row.ecar_no = (
            f"ECAR-{next_no:04d}"
        )

    if not row.issue_date:
        row.issue_date = date.today()
    if not row.date_initiated:
        row.date_initiated = date.today()

    db.add(row)
    db.commit()
    db.refresh(row)
    return to_row(row)

@router.patch("/{ecar_id}")
def update_ecar(
    ecar_id: int,
    payload: ECARUpdate,
    db: Session = Depends(get_db)
):

    row = db.get(
        ECAR,
        ecar_id
    )
    if not row:
        raise HTTPException(
            404,
            "ECAR not found"
        )

    for k, v in payload.dict(
        exclude_unset=True
    ).items():
        setattr(row, k, v)

    db.commit()
    db.refresh(row)
    return to_row(row)

@router.delete("/{ecar_id}")
def delete_ecar(
    ecar_id: int,
    db: Session = Depends(get_db)
):

    row = db.get(
        ECAR,
        ecar_id
    )

    if not row:
        raise HTTPException(
            404,
            "ECAR not found"
        )

    db.delete(row)

    db.commit()

    return {
        "success": True
    }


@router.get("/lookup/lot/{lot_no}")
def lookup_lot(
    lot_no: str,
    db: Session = Depends(get_db)
):

    lot = (
        db.query(ProductionLot)
        .options(
            joinedload(ProductionLot.po)
                .joinedload(PO.customer),

            joinedload(ProductionLot.part),

            joinedload(
                ProductionLot.part_revision
            )
        )
        .filter(
            ProductionLot.lot_no == lot_no
        )
        .first()
    )

    if not lot:
        raise HTTPException(
            404,
            "Lot not found"
        )

    return {

        "lot_id":
            lot.id,

        "lot_no":
            lot.lot_no,

        "customer_code":
            lot.po.customer.code
            if lot.po and lot.po.customer
            else "",

        "po_no":
            lot.po.po_number
            if lot.po
            else "",

        "part_no":
            lot.part.part_no
            if lot.part
            else "",

        "part_name":
            lot.part.name
            if lot.part
            else "",

        "rev":
            lot.part_revision.rev
            if lot.part_revision
            else ""
    }

@router.get("/{ecar_id}")
def get_ecar(
    ecar_id:int,
    db:Session=Depends(get_db)
):
    row = db.get(
        ECAR,
        ecar_id
    )

    if not row:
        raise HTTPException(
            404,
            "ECAR not found"
        )

    return row


@router.get("/lots/search")
def search_lots(
    term: str = "",
    db: Session = Depends(get_db)
):

    lots = (
        db.query(ProductionLot)
        .options(
            joinedload(ProductionLot.part),
            joinedload(ProductionLot.part_revision),
            joinedload(ProductionLot.po)
                .joinedload(PO.customer)
        )
        .filter(
            ProductionLot.lot_no.ilike(f"%{term}%")
        )
        .limit(20)
        .all()
    )

    return [

        {
            "label":
                f"{lot.lot_no} | "
                f"{lot.part.part_no if lot.part else ''} | "
                f"{lot.po.customer.code if lot.po and lot.po.customer else ''}",

            "value":
                lot.lot_no,

            "lot_id":
                lot.id,

            "customer_code":
                lot.po.customer.code
                if lot.po and lot.po.customer
                else "",

            "po_no":
                lot.po.po_number
                if lot.po
                else "",

            "part_no":
                lot.part.part_no
                if lot.part
                else "",

            "part_name":
                lot.part.name
                if lot.part
                else "",

            "rev":
                lot.part_revision.rev
                if lot.part_revision
                else ""
        }

        for lot in lots
    ]