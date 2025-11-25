from fastapi import APIRouter, Depends, HTTPException, Body
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func
from datetime import datetime
from pydantic import BaseModel

from database import get_db
from models import (
    ProductionLot,
    CustomerShipment,
    CustomerShipmentItem,
    Part,
    PartRevision
)

router = APIRouter(prefix="/lot-shippments", tags=["lot-shippments"])

class AllocatePartRequest(BaseModel):
    source_lot_id: int
    target_lot_id: int
    qty: float
    shipment_id: int | None = None  # ✅ ใหม่
# ---------- Helper ----------
def get_lot_or_404(db: Session, lot_id: int) -> ProductionLot:
    lot = db.get(ProductionLot, lot_id)
    if not lot:
        raise HTTPException(status_code=404, detail="Lot not found")
    return lot


def get_part_inventory_data(db: Session, lot_id: int):
    lot = get_lot_or_404(db, lot_id)
    part = db.get(Part, lot.part_id)
    if not part:
        raise HTTPException(status_code=404, detail="Part not found")

    # ✅ ใช้ traveler steps เพื่อคำนวณ finished_qty
    from models import ShopTraveler, ShopTravelerStep

    sub_max_seq = (
        db.query(
            ShopTravelerStep.traveler_id,
            func.max(ShopTravelerStep.seq).label("max_seq"),
        )
        .group_by(ShopTravelerStep.traveler_id)
        .subquery()
    )

    finished_qty = (
        db.query(func.coalesce(func.sum(ShopTravelerStep.qty_accept), 0))
        .join(
            sub_max_seq,
            (ShopTravelerStep.traveler_id == sub_max_seq.c.traveler_id)
            & (ShopTravelerStep.seq == sub_max_seq.c.max_seq),
        )
        .join(ShopTraveler, ShopTraveler.id == ShopTravelerStep.traveler_id)
        .filter(ShopTraveler.lot_id == lot.id)
        .filter(ShopTravelerStep.status.in_(["passed", "completed"]))  # ✅ fixed
        .scalar()
        or 0
    )

    shipped_qty = (
        db.query(func.sum(CustomerShipmentItem.qty))
        .filter(CustomerShipmentItem.lot_id == lot_id)
        .scalar()
        or 0
    )

    planned_qty = float(lot.planned_qty or 0)
    finished_qty = float(finished_qty)
    shipped_qty = float(shipped_qty)
    available_qty = max(finished_qty - shipped_qty, 0)

    return part, planned_qty, finished_qty, shipped_qty, available_qty


# ============================================================
# 1️⃣  List shipments for a lot
# ============================================================
from models import PO, Customer
@router.get("/{lot_id}")
def list_lot_shipments(lot_id: int, db: Session = Depends(get_db)):
    

    shipments = (
        db.query(CustomerShipment)
        .options(
            joinedload(CustomerShipment.items),
            joinedload(CustomerShipment.po).joinedload(PO.customer),  # ✅ load customer name
        )
        .filter(CustomerShipment.lot_id == lot_id)
        .order_by(CustomerShipment.shipped_at.desc())
        .all()
    )

    result = []
    for s in shipments:
        items = s.items or []
        qty_sum = sum(float(i.qty or 0) for i in items)

        # ✅ ดึงรายการ lot_id ทั้งหมดจาก shipment items
        source_lot_ids = list({i.lot_id for i in items if i.lot_id})

        # ✅ ดึง lot_no ที่ตรงกับ id เหล่านั้น
        lot_nos = (
            db.query(ProductionLot.lot_no)
            .filter(ProductionLot.id.in_(source_lot_ids))
            .all()
        )
        source_lot_nos = [r[0] for r in lot_nos]

        result.append({
            "id": s.id,
            "shipment_no": s.package_no or f"SHP-{s.id:05d}",
            "qty": qty_sum,
            "uom": "pcs",
            "status": s.status or "pending",
            "date": s.shipped_at,
            "shipped_date": s.shipped_at,
            "tracking_number": s.tracking_no,
            "customer_name": s.po.customer.name if s.po and s.po.customer else None,  # ✅ new
            "source_lot_ids": source_lot_ids,
            "source_lot_nos": source_lot_nos,
        })
    return result

# ============================================================
# 2️⃣  Allocate / Return part
# ============================================================
class PartQtyRequest(BaseModel):
    lot_id: int
    qty: float


def get_or_create_shipment(db: Session, lot: ProductionLot):
    """หรือล็อตนี้มี shipment แล้วหรือยัง — ถ้าไม่มีให้สร้างใหม่"""
    shipment = (
        db.query(CustomerShipment)
        .filter(CustomerShipment.lot_id == lot.id)
        .order_by(CustomerShipment.id.desc())
        .first()
    )

    if not shipment:
        shipment = CustomerShipment(
            po_id=lot.po_id,
            lot_id=lot.id,  # ✅ ผูกตรงกับ lot ปลายทาง
            shipped_at=datetime.now(),
            status="pending",
        )
        db.add(shipment)
        db.flush()

    return shipment



@router.post("/allocate-part")
def allocate_part(req: AllocatePartRequest, db: Session = Depends(get_db)):
    from models import ShopTraveler, ShopTravelerStep

    source_lot = db.get(ProductionLot, req.source_lot_id)
    target_lot = db.get(ProductionLot, req.target_lot_id)

    if not source_lot or not target_lot:
        raise HTTPException(status_code=404, detail="Lot not found")

    qty = float(req.qty)
    if qty <= 0:
        raise HTTPException(status_code=400, detail="Quantity must be greater than zero")

    # --- คำนวณ available จาก source lot ---
    sub_max_seq = (
        db.query(
            ShopTravelerStep.traveler_id,
            func.max(ShopTravelerStep.seq).label("max_seq"),
        )
        .group_by(ShopTravelerStep.traveler_id)
        .subquery()
    )

    finished_qty = (
        db.query(func.coalesce(func.sum(ShopTravelerStep.qty_accept), 0))
        .join(
            sub_max_seq,
            (ShopTravelerStep.traveler_id == sub_max_seq.c.traveler_id)
            & (ShopTravelerStep.seq == sub_max_seq.c.max_seq),
        )
        .join(ShopTraveler, ShopTraveler.id == ShopTravelerStep.traveler_id)
        .filter(ShopTraveler.lot_id == source_lot.id)
        .filter(ShopTravelerStep.status.in_(["passed", "completed"]))
        .scalar()
        or 0
    )

    shipped_qty = (
        db.query(func.coalesce(func.sum(CustomerShipmentItem.qty), 0))
        .filter(CustomerShipmentItem.lot_id == source_lot.id)
        .scalar()
        or 0
    )

    available_qty = float(finished_qty) - float(shipped_qty)
    if qty > available_qty:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot allocate {qty} pcs — only {available_qty} available in {source_lot.lot_no}",
        )

    # ✅ ถ้ามี shipment_id ให้ใช้เลย ไม่ต้องสร้างใหม่
    shipment = None
    if req.shipment_id:
        shipment = db.get(CustomerShipment, req.shipment_id)
        if not shipment:
            raise HTTPException(status_code=404, detail="Shipment not found")
    else:
        shipment = get_or_create_shipment(db, target_lot)

    new_item = CustomerShipmentItem(
        shipment_id=shipment.id,
        po_line_id=target_lot.po_line_id or 0,
        lot_id=source_lot.id,  # ✅ ของมาจาก lot ต้นทาง
        qty=qty,
    )

    db.add(new_item)
    db.commit()
    db.refresh(new_item)

    return {
        "status": "ok",
        "from": source_lot.lot_no,
        "to": target_lot.lot_no,
        "shipment_id": shipment.id,
        "allocated_qty": qty,
        "available_after": available_qty - qty,
    }


@router.post("/return-part")
def return_part(req: dict = Body(...), db: Session = Depends(get_db)):
    source_lot_id = req.get("source_lot_id")
    target_lot_id = req.get("target_lot_id")
    shipment_id = req.get("shipment_id")  # ✅ optional
    qty = float(req.get("qty", 0))

    if not source_lot_id or not target_lot_id:
        raise HTTPException(status_code=400, detail="Missing source_lot_id or target_lot_id")
    if qty <= 0:
        raise HTTPException(status_code=400, detail="Quantity must be > 0")
    if shipment_id:
        shipments = [db.get(CustomerShipment, shipment_id)]
    else:
        shipments = (
            db.query(CustomerShipment)
            .filter(CustomerShipment.lot_id == target_lot_id)
            .order_by(CustomerShipment.id.desc())
            .all()
        )

    if not shipments:
        raise HTTPException(status_code=400, detail="No shipment found for target lot")
    # ✅ target lot ต้องมี shipment ของตัวเอง
    shipments = (
        db.query(CustomerShipment)
        .filter(CustomerShipment.lot_id == target_lot_id)
        .order_by(CustomerShipment.id.desc())
        .all()
    )
    if not shipments:
        raise HTTPException(status_code=400, detail="No shipment found for target lot")

    remain = qty
    total_returned = 0.0

    # ✅ คืนจาก item ที่มาจาก source_lot ภายใต้ shipment ของ target_lot เท่านั้น
    for s in shipments:
        items = (
            db.query(CustomerShipmentItem)
            .filter(CustomerShipmentItem.shipment_id == s.id)
            .filter(CustomerShipmentItem.lot_id == source_lot_id)
            .order_by(CustomerShipmentItem.id.desc())
            .all()
        )
        for it in items:
            if remain <= 0:
                break
            if float(it.qty) <= remain:
                remain -= float(it.qty)
                total_returned += float(it.qty)
                db.delete(it)
            else:
                it.qty = float(it.qty) - remain
                total_returned += remain
                remain = 0
        if remain <= 0:
            break

    db.commit()

    if total_returned == 0:
        raise HTTPException(status_code=400, detail="No part available to return")

    return {
        "status": "returned",
        "returned_qty": total_returned,
        "source_lot_id": source_lot_id,
        "target_lot_id": target_lot_id,
    }


# ============================================================
# 3️⃣  Delete shipment
# ============================================================
@router.delete("/delete/{shipment_id}")
def delete_shipment(shipment_id: int, db: Session = Depends(get_db)):
    s = db.get(CustomerShipment, shipment_id)
    if not s:
        raise HTTPException(status_code=404, detail="Shipment not found")
    db.delete(s)
    db.commit()
    return {"status": "deleted", "shipment_id": shipment_id}

# ============================================================
# 4️⃣  Shipment history
# ============================================================
@router.get("/history/{lot_id}")
def shipment_history(lot_id: int, db: Session = Depends(get_db)):
    rows = (
        db.query(CustomerShipment)
        .join(CustomerShipment.items)
        .filter(CustomerShipmentItem.lot_id == lot_id)
        .order_by(CustomerShipment.shipped_at.desc())
        .all()
    )
    return [
        {
            "id": r.id,
            "shipment_no": r.package_no or f"SHP-{r.id:05d}",
            "qty": sum(float(i.qty or 0) for i in r.items if i.lot_id == lot_id),
            "uom": "pcs",
            "status": r.status or "pending",
            "created_at": r.shipped_at,
        }
        for r in rows
    ]


# ============================================================
# 5️⃣  Header info
# ============================================================
@router.get("/lot/{lot_id}/header")
def get_lot_header(lot_id: int, db: Session = Depends(get_db)):
    lot = (
        db.query(ProductionLot)
        .options(joinedload(ProductionLot.part))
        .filter(ProductionLot.id == lot_id)
        .first()
    )
    if not lot:
        raise HTTPException(status_code=404, detail="Lot not found")

    part, planned, finished, shipped, available = get_part_inventory_data(db, lot.id)

    return {
        "lot_id": lot.id,
        "lot_no": lot.lot_no,
        "part_no": part.part_no if part else None,
        "planned_qty": planned,
        "finished_qty": finished,
        "shipped_qty": shipped,
        "available_qty": available,
        "status": lot.status,
        "due_date": lot.lot_due_date,
    }


# ============================================================
# 6️⃣  Part inventory + progress
# ============================================================
@router.get("/lot/{lot_id}/part-inventory")
def get_part_inventory(lot_id: int, db: Session = Depends(get_db)):
    part, planned, finished, shipped, available = get_part_inventory_data(db, lot_id)
    progress_percent = round(finished / planned * 100, 2) if planned > 0 else 0
    return {
        "part_id": part.id,
        "part_no": part.part_no,
        "lot_id": lot_id,
        "planned_qty": planned,
        "finished_qty": finished,
        "shipped_qty": shipped,
        "available_qty": available,
        "progress_percent": progress_percent,
        "uom": getattr(part, "uom", "pcs"),
    }


# ============================================================
# 7️⃣  Update status
# ============================================================
@router.patch("/{shipment_id}/status")
def update_shipment_status(
    shipment_id: int, data: dict = Body(...), db: Session = Depends(get_db)
):
    s = db.get(CustomerShipment, shipment_id)
    if not s:
        raise HTTPException(status_code=404, detail="Shipment not found")

    new_status = data.get("status")
    if new_status not in ["pending", "shipped", "cancelled"]:
        raise HTTPException(status_code=400, detail="Invalid status")

    s.status = new_status
    db.commit()
    return {"status": "ok", "shipment_id": s.id, "new_status": s.status}




# ============================================================
# 6️⃣  Part inventory (ทุก lot ของ part เดียวกัน)
# ============================================================
@router.get("/lot/{lot_id}/part-inventory/all")
def get_part_inventory_all_for_same_part(lot_id: int, db: Session = Depends(get_db)):
    lot = get_lot_or_404(db, lot_id)
    part_id = lot.part_id

    lots = db.query(ProductionLot).filter(ProductionLot.part_id == part_id).all()
    results = []

    for l in lots:
        part, planned, finished, shipped, available = get_part_inventory_data(db, l.id)
        progress_percent = round(finished / planned * 100, 2) if planned > 0 else 0
        results.append({
            "lot_id": l.id,
            "lot_no": l.lot_no,
            "part_no": part.part_no,
            "planned_qty": planned,
            "finished_qty": finished,
            "shipped_qty": shipped,
            "available_qty": available,
            "progress_percent": progress_percent,
            "uom": getattr(part, "uom", "pcs"),
        })

    return results

# ============================================================
# 🆕 Create a new shipment for a lot
# ============================================================
@router.post("")
def create_shipment(req: dict = Body(...), db: Session = Depends(get_db)):
    lot_id = req.get("lot_id")
    if not lot_id:
        raise HTTPException(status_code=400, detail="Missing lot_id")

    lot = db.get(ProductionLot, lot_id)
    if not lot:
        raise HTTPException(status_code=404, detail="Lot not found")

    shipment = CustomerShipment(
        po_id=lot.po_id,
        lot_id=lot.id,
        shipped_at=datetime.now(),
        status="pending",
    )
    db.add(shipment)
    db.commit()
    db.refresh(shipment)

    return {
        "status": "created",
        "shipment_id": shipment.id,
        "shipment_no": shipment.package_no or f"SHP-{shipment.id}",
        "lot_no": lot.lot_no,
        "message": f"Shipment created for lot {lot.lot_no}",
    }


@router.patch("/{shipment_id}/update-fields")
def update_shipment_fields(
    shipment_id: int,
    payload: dict = Body(...),
    db: Session = Depends(get_db),
):
    shipment = db.get(CustomerShipment, shipment_id)
    if not shipment:
        raise HTTPException(status_code=404, detail="Shipment not found")

    updated_fields = []

    # ---- Tracking No ----
    if "tracking_number" in payload:
        shipment.tracking_no = payload["tracking_number"]
        updated_fields.append("tracking_number")

    # ---- Shipped Date ----
    if "shipped_date" in payload:
        try:
            shipment.shipped_at = datetime.fromisoformat(payload["shipped_date"])
        except Exception:
            shipment.shipped_at = datetime.utcnow()
        updated_fields.append("shipped_date")

    # ---- Status (NEW) ----
    if "status" in payload:
        shipment.status = payload["status"]
        updated_fields.append("status")

    # ---- Qty (NEW) ----
    if "qty" in payload:
        # ต้องแก้ที่ CustomerShipmentItem
        items = (
            db.query(CustomerShipmentItem)
            .filter(CustomerShipmentItem.shipment_id == shipment_id)
            .all()
        )
        if items:
            items[0].qty = float(payload["qty"])
            updated_fields.append("qty")

    db.commit()
    db.refresh(shipment)

    return {
        "id": shipment.id,
        "updated_fields": updated_fields,
        "status": shipment.status,
        "tracking_no": shipment.tracking_no,
        "shipped_at": shipment.shipped_at,
    }



# ============================================================
# 8️⃣  Download CofC as DOCX
# ============================================================
from fastapi.responses import FileResponse
from docx import Document
import tempfile
import os

@router.get("/{shipment_id}/download/cofc")
def download_cofc(shipment_id: int, db: Session = Depends(get_db)):
    import os, tempfile
    from docx import Document
    from fastapi.responses import FileResponse
    from datetime import datetime

    # 1) Load shipment + items + lot + part + revision
    shipment = (
        db.query(CustomerShipment)
        .options(
            joinedload(CustomerShipment.items)
                .joinedload(CustomerShipmentItem.lot)
                .joinedload(ProductionLot.part),

            joinedload(CustomerShipment.items)
                .joinedload(CustomerShipmentItem.lot)
                .joinedload(ProductionLot.part_revision),

            joinedload(CustomerShipment.po).joinedload(PO.customer),
        )
        .get(shipment_id)
    )

    if not shipment:
        raise HTTPException(status_code=404, detail="Shipment not found")

    if not shipment.items:
        raise HTTPException(status_code=400, detail="Shipment has no shipment items")

    # 🟦 ใช้ item แรกเป็นข้อมูลสำหรับ CofC
    item = shipment.items[0]
    lot = item.lot
    part = lot.part if lot else None
    revision = lot.part_revision if lot else None

    lot_no = lot.lot_no if lot else ""
    qty = float(item.qty or 0)
    part_no = part.part_no if part else ""
    rev = revision.rev if revision else ""
    desc = part.name if part else ""

    # PO + Customer
    customer_name = shipment.po.customer.name if shipment.po and shipment.po.customer else ""
    customer_address = shipment.po.customer.address if shipment.po and shipment.po.customer else ""
    po_no = shipment.po.po_number if shipment.po else ""
    cert_no = f"CERT-{shipment.id:05d}"

    replace_map = {
        "{CUSTOMER}": customer_name,
        "{CUSTOMER_ADDRESS}": customer_address,
        "{PO_NO}": po_no,
        "{PART_NO}": part_no,
        "{REV}": rev,
        "{QTY}": str(qty),
        "{LOT_NO}": lot_no,
        "{LOT}": lot_no,
        "{DESCRIPTION}": desc,
        "{CERT_NO}": cert_no,
        "{DATE}": datetime.now().strftime("%m/%d/%Y"),
        "{}":"10",
    }

    template_path = "templates/cofc.docx"
    if not os.path.exists(template_path):
        raise HTTPException(status_code=404, detail="Template not found")

    doc = Document(template_path)

    # 2) Correct replace → preserve formatting
    def replace_runs(paragraph):
        for run in paragraph.runs:
            for k, v in replace_map.items():
                if k in run.text:
                    run.text = run.text.replace(k, v or "")

    # Replace in paragraphs
    for p in doc.paragraphs:
        replace_runs(p)

    # Replace in tables
    for table in doc.tables:
        for row in table.rows:
            for cell in row.cells:
                for p in cell.paragraphs:
                    replace_runs(p)

    # Save temp file
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".docx")
    doc.save(tmp.name)

    return FileResponse(
        tmp.name,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        filename=f"CofC_{shipment_id}.docx"
    )


##Labels: recent-edits
@router.get("/{shipment_id}/download/label/{size}")
def download_label(shipment_id: int, size: int, db: Session = Depends(get_db)):
    import os, tempfile
    from docx import Document
    from fastapi.responses import FileResponse
    from datetime import datetime

    if size not in (80, 60, 30):
        raise HTTPException(status_code=400, detail="Invalid label size")

    shipment = (
        db.query(CustomerShipment)
        .options(
            joinedload(CustomerShipment.items)
                .joinedload(CustomerShipmentItem.lot)
                .joinedload(ProductionLot.part),
            joinedload(CustomerShipment.items)
                .joinedload(CustomerShipmentItem.lot)
                .joinedload(ProductionLot.part_revision),
        )
        .get(shipment_id)
    )

    if not shipment or not shipment.items:
        raise HTTPException(status_code=404, detail="Shipment not found or empty")

    item = shipment.items[0]

    # -------- load data --------
    lot = item.lot
    part = lot.part if lot else None
    rev_obj = lot.part_revision if lot else None
    po_no = shipment.po.po_number if shipment.po else ""
    replace_map = {
        "{PART}": "PART: "+ part.part_no+ " "+part.name if part else "",
        "{REV}": "REV: "+ rev_obj.rev +" LOT: "+ lot.lot_no +" PO:"+ po_no if rev_obj else "",
        "{LOT_NO}": lot.lot_no if lot else "",
        "{QTY}": str(float(item.qty or 0)),
        "{DESCRIPTION}": part.name if part else "",
        "{DATE}": datetime.now().strftime("%m/%d/%Y"),
    }

    # -------- template --------
    template_path = f"templates/label_{size}.docx"
    if not os.path.exists(template_path):
        raise HTTPException(status_code=404, detail=f"Template label {size} not found")

    doc = Document(template_path)

    # -------- correct replace preserving format --------
    def replace_runs(paragraph):
        for run in paragraph.runs:
            for k, v in replace_map.items():
                if k in run.text:
                    run.text = run.text.replace(k, v)

    for p in doc.paragraphs:
        replace_runs(p)

    for table in doc.tables:
        for row in table.rows:
            for cell in row.cells:
                for p in cell.paragraphs:
                    replace_runs(p)

    # -------- save temp --------
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".docx")
    doc.save(tmp.name)

    return FileResponse(
        tmp.name,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        filename=f"Label_{shipment_id}_{size}.docx"
    )