# routers/travelers.py
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, selectinload
from sqlalchemy import or_
from typing import List, Optional
from datetime import date
from models import PartRevision
from doc.docx_to_db import (
    create_template_from_parsed_result,
)
from utils.step_utils import calculate_step_status
from models import CustomerShipmentItem
from sqlalchemy import func

from database import get_db
from models import (
    ShopTraveler,
    ShopTravelerStep,
    ProductionLot,
    Employee,
    TravelerTemplate,
    TravelerTemplateStep,
    ShopTravelerStepLog,
)

from models import ECAR, ICAR
from pydantic import BaseModel, ConfigDict
from utils.code_generator import next_code_yearly
from sqlalchemy import (
    Column, Integer, String, DateTime, ForeignKey, Boolean,
    Numeric, Text, Index, UniqueConstraint, func
)
router = APIRouter(prefix="/travelers", tags=["travelers"])

# ---------- Schemas ----------
class ShopTravelerCreate(BaseModel):
    traveler_no: Optional[str] = None
    lot_id: int
    created_by_id: Optional[int] = None
    status: str = "open"
    notes: Optional[str] = None
    production_due_date: Optional[date] = None

class ShopTravelerUpdate(BaseModel):
    traveler_no: Optional[str] = None
    lot_id: Optional[int] = None      # allow changing lot (ถ้าไม่อยากให้แก้ ลบบรรทัดนี้)
    created_by_id: Optional[int] = None
    status: Optional[str] = None
    notes: Optional[str] = None
    production_due_date: Optional[date] = None

class ShopTravelerRowOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    traveler_no: Optional[str] = None
    lot_id: int
    lot_no: Optional[str] = None
    created_by_id: Optional[int] = None
    status: str
    notes: Optional[str] = None
    production_due_date: Optional[date] = None
    created_at: Optional[str] = None
    part_id: Optional[int] = None
    part_revision_id: Optional[int] = None
    start_qty: Optional[int] = 0
    final_qty: Optional[int] = 0
   # 🔥 ADD THIS
    latest_template: Optional[bool] = False
    latest_template_name: Optional[str] = None
    latest_template_version: Optional[int] = None
    lot: Optional[dict] = None
    part_no: Optional[str] = None
    part_rev: Optional[str] = None

    stock_qty: Optional[int] = 0

    

# ---------- Helpers ----------
def to_row_out(t: ShopTraveler, db: Session) -> ShopTravelerRowOut:

     # =========================
    # START QTY
    # =========================

    start_qty = 0

    op010 = next(
        (
            s for s in t.steps
            if str(s.step_code).strip() == "010"
        ),
        None
    )

    if op010:

        for log in op010.logs or []:

            start_qty += (
                (log.qty_accept or 0)
                + (log.qty_reject or 0)
            )

    # =========================
    # FINAL QTY
    # =========================
    # =========================
    # =========================
    # FINAL QTY = GOOD OF LAST STEP
    # =========================

    final_qty = 0

    steps_sorted = sorted(
        t.steps or [],
        key=lambda s: (
            int(''.join(filter(str.isdigit, str(s.step_code or "0"))))
            if any(ch.isdigit() for ch in str(s.step_code or ""))
            else 999999
        )
    )

    final_step = (
        steps_sorted[-1]
        if steps_sorted
        else None
    )

    if final_step:

        for log in final_step.logs or []:

            final_qty += (
                log.qty_accept or 0
            )


    # =========================
    # STOCK QTY
    # =========================

    lot_shipped_qty = (
        db.query(
            func.coalesce(
                func.sum(CustomerShipmentItem.qty),
                0
            )
        )
        .filter(
            CustomerShipmentItem.lot_id == t.lot.id
        )
        .scalar()
        if t.lot else 0
    )

    stock_qty = (
        final_qty - lot_shipped_qty
    )

    row = ShopTravelerRowOut(
        id=t.id,
        traveler_no=t.traveler_no,
        lot_id=t.lot_id,
        lot_no=(t.lot.lot_no if t.lot else None),
        created_by_id=t.created_by_id,
        status=t.status,
        notes=t.notes,
        production_due_date=t.production_due_date,
        created_at=t.created_at.isoformat() if t.created_at else None,

        # 🔥 ADD
        start_qty=start_qty,
        final_qty=final_qty,
        stock_qty=stock_qty,

        part_id=t.lot.part_id if t.lot else None,
        part_revision_id=t.lot.part_revision_id if t.lot else None,
        part_no=(
            t.lot.part.part_no
            if t.lot and t.lot.part
            else None
        ),

        part_rev=(
            t.lot.part_revision.rev
            if t.lot and t.lot.part_revision
            else None
        ),
    )

    data = row.model_dump()

    # 🔥 current template used by traveler
    tmpl = t.template

    data["latest_template"] = bool(tmpl and tmpl.is_latest)
    data["lot"] = {
        "id": t.lot.id,

        "part_revision": {
            "id": t.lot.part_revision.id,
            "rev": t.lot.part_revision.rev,
            "material": t.lot.part_revision.material,
        } if t.lot and t.lot.part_revision else None,
    }

    if tmpl:
        
        data["latest_template_name"] = tmpl.template_name
        data["latest_template_version"] = tmpl.version

    return ShopTravelerRowOut(**data)

# ---------- CREATE ----------
@router.post("", response_model=ShopTravelerRowOut)
def create_traveler(payload: ShopTravelerCreate, db: Session = Depends(get_db)):
    lot = db.get(ProductionLot, payload.lot_id)
    if not lot:
        raise HTTPException(404, "Lot not found")

    raw_code = (payload.traveler_no or "").strip().upper()
    autogen = raw_code in ("", "AUTO", "AUTOGEN")

    traveler_no = next_code_yearly(db, ShopTraveler, "traveler_no", prefix="TR") if autogen else raw_code

    # ✅ ถ้าผู้ใช้กำหนดเอง ต้องเช็คซ้ำซ้อน
    if not autogen:
        dup = db.query(ShopTraveler).filter(ShopTraveler.traveler_no == traveler_no).first()
        if dup:
            raise HTTPException(409, "Duplicate traveler_no")

    t = ShopTraveler(
        traveler_no=traveler_no,
        lot_id=payload.lot_id,
        created_by_id=payload.created_by_id,
        status=payload.status or "open",
        notes=payload.notes,
        production_due_date=payload.production_due_date,
    )
    db.add(t)
    db.commit()
    # eager lot for lot_no on response
    db.refresh(t)
    db.refresh(t, attribute_names=["lot"])
    return to_row_out(t, db)

# ---------- LIST ----------

from fastapi import Query

@router.get("/template-versions")
def list_template_versions(
    part_id: int | None = Query(None),
    part_revision_id: int | None = Query(None),
    db: Session = Depends(get_db),
):
    q = db.query(TravelerTemplate)

    if part_id:
        q = q.filter(TravelerTemplate.part_id == part_id)

    if part_revision_id:
        q = q.filter(TravelerTemplate.part_revision_id == part_revision_id)

    rows = q.order_by(
        TravelerTemplate.template_name,
        TravelerTemplate.version.desc()
    ).all()

    return [
        {
            "id": t.id,
            "name": t.template_name,
            "version": t.version,
            "is_active": t.is_active,
            "is_latest": t.is_latest
        }
        for t in rows
    ]

@router.get("/traveler-templates/active")
def get_active_template(
    traveler_id: int | None = None,
    part_id: int | None = None,
    part_revision_id: int | None = None,
    db: Session = Depends(get_db),
):
    print("Get active template for traveler_id:", traveler_id, "part_id:", part_id, "part_revision_id:", part_revision_id)
    if traveler_id:
        traveler = db.get(ShopTraveler, traveler_id)
        if not traveler:
            raise HTTPException(404, "Traveler not found")

        lot = traveler.lot
        part_id = lot.part_id
        part_revision_id = lot.part_revision_id

    tmpl = (
        db.query(TravelerTemplate)
        .filter(
            TravelerTemplate.part_id == part_id,
            TravelerTemplate.part_revision_id == part_revision_id,
            TravelerTemplate.is_active.is_(True),
            TravelerTemplate.is_latest == True,   # ✅ PUT BACK
        )
        .order_by(TravelerTemplate.version.desc()).first()
    )

    if not tmpl:
        raise HTTPException(404, "No active template found")

    return {
    "id": tmpl.id,
    "template_name": tmpl.template_name,
    "version": tmpl.version,
    "part_id": tmpl.part_id,
    "part_revision_id": tmpl.part_revision_id,
}

@router.get("", response_model=List[ShopTravelerRowOut])
def list_travelers(
    q: Optional[str] = Query(None, description="ค้นหา lot_code / lot_no"),
    lot_id: Optional[int] = Query(None, description="Filter by lot ID"),
    # ✅ ADD THIS
    status: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    query = db.query(ShopTraveler).options(
    selectinload(ShopTraveler.lot)
        .selectinload(ProductionLot.part_revision),

    selectinload(ShopTraveler.template),
)

    # 🔍 ถ้ามี q (ค้นหาด้วย lot_no หรือ lot_code)
    if q:
        ql = f"%{q}%"
        query = (
            query.join(ShopTraveler.lot)
            .filter(or_(ProductionLot.lot_no.ilike(ql), ProductionLot.lot_code.ilike(ql)))
        )
    print("Filtering travelers with q:", q, "lot_id:", lot_id, "status:", status)  
    # 🔍 ถ้ามี lot_id (กรองเฉพาะ lot_id นั้น)
    # 🔍 lot_id
    if lot_id:
        query = query.filter(
            ShopTraveler.lot_id == lot_id
        )

    # 🔥 status
    if status:
        query = query.filter(
            ShopTraveler.status == status
        )
    rows = query.order_by(ShopTraveler.id.desc()).all()
    return [to_row_out(t, db) for t in rows]
# ---------- GET ----------
@router.get("/by-lot-code/{lot_no}", response_model=ShopTravelerRowOut)
def get_traveler_by_lot_no(
    lot_no: str,
    db: Session = Depends(get_db)
):

    lot_no = lot_no.strip().upper()

    print("Getting traveler by lot_no:", lot_no)

    t = (
        db.query(ShopTraveler)
          .options(
              selectinload(ShopTraveler.lot)
                  .selectinload(ProductionLot.part_revision),

              selectinload(ShopTraveler.template),
          )
          .join(ProductionLot)
          .filter(
              func.trim(
                  func.upper(ProductionLot.lot_no)
              ) == lot_no
          )
          .first()
    )

    if not t:
        raise HTTPException(404, "Traveler not found")

    print("Found traveler:", t)

    return to_row_out(t, db)

@router.get("/{traveler_id}", response_model=ShopTravelerRowOut)
def get_traveler(traveler_id: int, db: Session = Depends(get_db)):
    """
    ดึง Traveler เดี่ยว พร้อม eager load lot
    """
    t = (
        db.query(ShopTraveler)
        .options(
                selectinload(ShopTraveler.lot)
                    .selectinload(ProductionLot.part_revision),

                selectinload(ShopTraveler.template),

                selectinload(ShopTraveler.steps)
                    .selectinload(ShopTravelerStep.logs),
            )
        .filter(ShopTraveler.id == traveler_id)
        .first()
    )
    if not t:
        raise HTTPException(404, "Traveler not found")
    return to_row_out(t, db)





# ---------- UPDATE ----------
@router.put("/{traveler_id}", response_model=ShopTravelerRowOut)
def update_traveler(traveler_id: int, payload: ShopTravelerUpdate, db: Session = Depends(get_db)):
    t = db.get(ShopTraveler, traveler_id)
    if not t:
        raise HTTPException(404, "Traveler not found")

    data = payload.dict(exclude_unset=True)

    # ✅ traveler_no (แก้ไขได้ + กันซ้ำ)
    if "traveler_no" in data and data["traveler_no"] is not None:
        new_no = data["traveler_no"].strip().upper()
        if new_no in ("", "AUTO", "AUTOGEN"):
            new_no = next_code_yearly(db, ShopTraveler, "traveler_no", prefix="TR")
        else:
            dup = (
                db.query(ShopTraveler)
                .filter(ShopTraveler.traveler_no == new_no, ShopTraveler.id != traveler_id)
                .first()
            )
            if dup:
                raise HTTPException(409, "Duplicate traveler_no")
        t.traveler_no = new_no

    # lot_id
    if "lot_id" in data and data["lot_id"] is not None:
        if not db.get(ProductionLot, data["lot_id"]):
            raise HTTPException(404, "Lot not found")
        t.lot_id = data["lot_id"]

    # created_by_id
    if "created_by_id" in data and data["created_by_id"] is not None:
        if not db.get(Employee, data["created_by_id"]):
            raise HTTPException(404, "Creator employee not found")
        t.created_by_id = data["created_by_id"]

    if "status" in data and data["status"] is not None:
        t.status = data["status"]

    if "notes" in data and data["notes"] is not None:
        t.notes = data["notes"]

    if "production_due_date" in data:
        t.production_due_date = data["production_due_date"]

    db.commit()
    db.refresh(t)
    db.refresh(t, attribute_names=["lot"])
    return to_row_out(t, db)

# ---------- DELETE ----------
@router.delete("/{traveler_id}")
def delete_traveler(traveler_id: int, db: Session = Depends(get_db)):
    t = db.get(ShopTraveler, traveler_id)
    if not t:
        raise HTTPException(404, "Traveler not found")
    if t.steps and len(t.steps) > 0:
        raise HTTPException(400, "Traveler has steps; cannot delete")
    db.delete(t)
    db.commit()
    return {"message": "Traveler deleted"}


### QR related endpoints can be added here later
from models import ShopTravelerStep, ShopTraveler, Employee
@router.post("/traveler/scan")
def scan_traveler(payload: dict, db: Session = Depends(get_db)):
    qr_code = payload.get("qr_code")
    traveler = db.query(ShopTraveler).filter_by(qr_code=qr_code).first()
    if not traveler:
        raise HTTPException(status_code=404, detail="Traveler not found")

    # หาขั้นตอนถัดไป (หรือ current)
    step = (
        db.query(ShopTravelerStep)
        .filter(ShopTravelerStep.traveler_id == traveler.id)
        .filter(ShopTravelerStep.seq == traveler.current_step_seq)
        .first()
    )

    if not step:
        raise HTTPException(status_code=404, detail="No pending step found")

    return {
        "traveler_id": traveler.id,
        "traveler_no": traveler.traveler_no,
        "step_seq": step.seq,
        "step_code": step.step_code,
        "step_name": step.step_name,
    }

@router.post("/traveler/{traveler_id}/record")
def record_step(traveler_id: int, payload: dict, db: Session = Depends(get_db)):
    print("Payload:", payload)
    step_code = payload.get("step_code")

    step = (
        db.query(ShopTravelerStep)
        .filter(ShopTravelerStep.traveler_id == traveler_id)
        .filter(ShopTravelerStep.step_code == step_code)
        .first()
    )
    if not step:
        raise HTTPException(status_code=404, detail="Step not found")

    step.qty_receive = payload.get("receive_qty", 0)
    step.qty_accept = payload.get("accept_qty", 0)
    step.qty_reject = payload.get("reject_qty", 0)
    step.step_note = payload.get("remark", "")
    step.status = "passed"
    step.finished_at = func.now()

    # update traveler.current_step_seq → next step
    next_step = (
        db.query(ShopTravelerStep)
        .filter(ShopTravelerStep.traveler_id == traveler_id)
        .filter(ShopTravelerStep.seq > step.seq)
        .order_by(ShopTravelerStep.seq)
        .first()
    )
    traveler = db.get(ShopTraveler, traveler_id)
    if next_step:
        traveler.current_step_seq = next_step.seq
    else:
        traveler.status = "done"

    db.commit()
    return {"message": "✅ Step completed successfully"}

@router.post("/{traveler_id}/create-template-version")
def create_template_version(
    traveler_id: int,
    db: Session = Depends(get_db)
):

    try:

        traveler = (
            db.query(ShopTraveler)
            .options(
                selectinload(ShopTraveler.lot).selectinload(ProductionLot.part_revision),
                selectinload(ShopTraveler.steps)
            )
            .filter(
                ShopTraveler.id == traveler_id
            )
            .first()
        )

        if not traveler:
            raise HTTPException(
                404,
                "Traveler not found"
            )

        lot = traveler.lot
        print("LOT",lot)

        if not lot:
            raise HTTPException(
                400,
                "Traveler has no lot"
            )

        # =========================
        # BUILD PARSED RESULT
        # =========================
        print("LOT:",lot.part_revision, ">", lot.part_revision.material)
        result = {
            "lot": {
                "part_no": lot.part.part_no,
                "rev":
                    lot.part_revision.rev
                    if lot.part_revision else None,
                "material": (
                    lot.part_revision.material
                    if lot.part_revision else None
                ),
            },

            "traveler": {
                "risk": traveler.risk_level,
            },

            "steps": []
        }

        for s in traveler.steps:

            result["steps"].append({

                "order": s.seq,

                "step_code": s.step_code,

                "step_name": s.step_name,

                "step_detail": s.step_detail,

                "step_type": s.station,

                "qa_required": False,
            })

        # =========================
        # RESOLVE PART/REV
        # =========================
        part = lot.part
        part_rev = lot.part_revision

        # =========================
        # CREATE TEMPLATE
        # =========================
        tmpl = create_template_from_parsed_result(
            db,
            result,
            part,
            part_rev,
        )

        traveler.template_id = tmpl.id

       
        db.commit()

        return {

            "message":
                "Template version created",

            "template_id":
                tmpl.id,

            "version":
                tmpl.version,
        }

    except Exception as e:

        db.rollback()

        print(
            "❌ create_template_version error:",
            e
        )

        raise HTTPException(
            status_code=500,
            detail=str(e)
        )

@router.post("/apply-template/{traveler_id}")
def apply_template(
    traveler_id: int,
    db: Session = Depends(get_db)
):
    print("Applying template to traveler_id:", traveler_id)
    traveler = db.get(ShopTraveler, traveler_id)
    print("traveler =", traveler)
    print("part_id =", traveler.lot.part_id)
    print("rev_id =", traveler.lot.part_revision_id)

    if not traveler:
        raise HTTPException(404, "Traveler not found")

    tmpl = (
    db.query(TravelerTemplate)
        .filter(
            TravelerTemplate.part_id == traveler.lot.part_id,
            TravelerTemplate.part_revision_id == traveler.lot.part_revision_id,
            TravelerTemplate.is_active == True,
            TravelerTemplate.is_latest == True,
        )
        .first()
    )
    
    print("template =", tmpl)
    

    if not tmpl:
        raise HTTPException(404, "Template not found")
    
    traveler.template_id = tmpl.id

    # 🔥 APPLY TEMPLATE MATERIAL
    if (
        tmpl.material
        and traveler.lot
        and traveler.lot.part_revision
    ):
        traveler.lot.part_revision.material = tmpl.material

    # 🔥 delete old steps
    old_steps = (
        db.query(ShopTravelerStep)
        .filter(ShopTravelerStep.traveler_id == traveler_id)
        .all()
    )

    old_step_ids = [s.id for s in old_steps]

    if old_step_ids:
        db.query(ShopTravelerStepLog).filter(
            ShopTravelerStepLog.step_id.in_(old_step_ids)
        ).delete(synchronize_session=False)

    # 🔥 DELETE OLD STEPS
    db.query(ShopTravelerStep).filter(
        ShopTravelerStep.traveler_id == traveler_id
    ).delete(synchronize_session=False)

    db.flush()

    # 🔥 copy template steps
    for s in tmpl.steps:
        
        row = ShopTravelerStep(
            traveler_id=traveler_id,

            seq=s.seq,
            step_code=s.step_code,
            step_name=s.step_name,
            step_detail=s.step_detail,

            status="pending",
        )

        db.add(row)

    db.commit()

    return {
        "message": "Template applied"
    }

@router.get("/by_no/{traveler_no}")
def get_traveler_by_no(
    traveler_no: str,
    seq: int | None = None,
    db: Session = Depends(get_db),
):
    traveler = (
        db.query(ShopTraveler)
        .options(
            selectinload(ShopTraveler.lot)
                .selectinload(ProductionLot.part),

            selectinload(ShopTraveler.lot)
                .selectinload(ProductionLot.part_revision),

            selectinload(ShopTraveler.steps)
                .selectinload(ShopTravelerStep.logs),

            selectinload(ShopTraveler.steps)
                .selectinload(ShopTravelerStep.operator),

            selectinload(ShopTraveler.template),
        )
        .filter(ShopTraveler.traveler_no == traveler_no)
        .first()
    )

    if not traveler:
        raise HTTPException(404, "Traveler not found")

    # =========================
    # ACTIVE STEP
    # =========================
    # =========================
    # FIND ACTIVE STEP
    # =========================

    sorted_steps = sorted(traveler.steps, key=lambda x: x.seq)

    active_step = None

    # ✅ if user explicitly requests seq
    if seq is not None:
        active_step = next(
            (s for s in sorted_steps if s.seq == seq),
            None
        )

    # ✅ auto find running/pending
    if not active_step:

        for i, s in enumerate(sorted_steps):

            qty_accept = sum(float(l.qty_accept or 0) for l in s.logs)
            qty_reject = sum(float(l.qty_reject or 0) for l in s.logs)

            # receive
            if i == 0:
                qty_receive = qty_accept + qty_reject
            else:
                prev = sorted_steps[i - 1]

                prev_accept = sum(
                    float(l.qty_accept or 0)
                    for l in prev.logs
                )

                qty_receive = prev_accept

            latest_po = None

            if s.logs:

                latest_log = sorted(
                    s.logs,
                    key=lambda l: (
                        l.work_date or date.min,
                        l.id or 0
                    )
                )[-1]

                latest_po = latest_log.supplier_po

            latest_po = None

            if s.logs:

                latest_log = sorted(
                    s.logs,
                    key=lambda l: (
                        l.work_date or date.min,
                        l.id or 0
                    )
                )[-1]

                latest_po = latest_log.supplier_po

            latest_po = None

            if s.logs:

                latest_log = sorted(
                    s.logs,
                    key=lambda l: (
                        l.work_date or date.min,
                        l.id or 0
                    )
                )[-1]

                latest_po = latest_log.supplier_po

            prev_step_code = None

            if i > 0:
                prev_step_code = sorted_steps[i - 1].step_code

            status = calculate_step_status(
                qty_receive,
                qty_accept,
                qty_reject,
                i == 0,
                s.input_mode,
                latest_po,
                prev_step_code,
            )

            print(
                "BY_NO STATUS:",
                s.step_code,
                s.input_mode,
                latest_po,
                status
            )

            # ⭐ FIRST non-passed step
            if status != "passed":
                active_step = s
                break

    # ✅ fallback
    if not active_step and sorted_steps:
        active_step = sorted_steps[-1]

    # =========================
    # STEP DATA
    # =========================
    steps = []

    prev_accept = 0

    for i, s in enumerate(sorted(traveler.steps, key=lambda x: x.seq)):

        qty_accept = sum(float(l.qty_accept or 0) for l in s.logs)
        qty_reject = sum(float(l.qty_reject or 0) for l in s.logs)

        if i == 0:
            qty_receive = qty_accept + qty_reject
        else:
            qty_receive = prev_accept

        qty_remain = qty_receive - (qty_accept + qty_reject)

        latest_po = None

        if s.logs:

            latest_log = sorted(
                s.logs,
                key=lambda l: (
                    l.work_date or date.min,
                    l.id or 0
                )
            )[-1]

            latest_po = latest_log.supplier_po

        prev_step_code = None

        if i > 0:
            prev_step_code = sorted(traveler.steps, key=lambda x: x.seq)[i - 1].step_code

        status = calculate_step_status(
            qty_receive,
            qty_accept,
            qty_reject,
            i == 0,
            s.input_mode,
            latest_po,
            prev_step_code,
        )

        print(
            "BY_NO STATUS:",
            s.step_code,
            s.input_mode,
            latest_po,
            status
        )

        steps.append({
            "id": s.id,
            "seq": s.seq,
            "step_code": s.step_code,
            "step_name": s.step_name,
            "status": status,
            "input_mode": s.input_mode,

            "qty_receive": qty_receive,
            "qty_accept": qty_accept,
            "qty_reject": qty_reject,
            "qty_remain": qty_remain,
        })

        prev_accept = qty_accept

        
    latest_ecar = (
        db.query(ECAR)
        .filter(
            ECAR.part_no ==
            traveler.lot.part.part_no
        )
        .order_by(ECAR.id.desc())
        .first()
    )

    latest_icar = (
        db.query(ICAR)
        .filter(
            ICAR.part_no ==
            traveler.lot.part.part_no
        )
        .order_by(ICAR.id.desc())
        .first()
    )

    return {
        "id": traveler.id,
        "traveler_no": traveler.traveler_no,
        "lot_id": traveler.lot_id,

        "lot": {
            "lot_no": traveler.lot.lot_no if traveler.lot else None,

            "part": {

                "part_no":
                    traveler.lot.part.part_no
                    if traveler.lot and traveler.lot.part
                    else None,

                "ecar":
                    "Y" if latest_ecar else "N",

                "icar":
                    "Y" if latest_icar else "N",

                "ecar_remark":
                    latest_ecar.remark
                    if latest_ecar
                    else None,

                "icar_remark":
                    latest_icar.remark
                    if latest_icar
                    else None,
            },

            "part_revision": {
                "id": traveler.lot.part_revision.id,
                "part_rev": traveler.lot.part_revision.rev
                if traveler.lot and traveler.lot.part_revision else None,
                "material": traveler.lot.part_revision.material
                if traveler.lot and traveler.lot.part_revision else None,
            }
        },

        "steps": steps,

        "active_step": next(
            (x for x in steps if active_step and x["id"] == active_step.id),
            None
        )
    }

# ---------- DELETE ALL STEPS ----------
@router.delete("/{traveler_id}/delete-all-steps")
def delete_all_steps(
    traveler_id: int,
    db: Session = Depends(get_db)
):
    traveler = db.get(ShopTraveler, traveler_id)

    if not traveler:
        raise HTTPException(404, "Traveler not found")

    # 🔥 get all step ids
    step_ids = [
        s.id
        for s in db.query(ShopTravelerStep)
        .filter(ShopTravelerStep.traveler_id == traveler_id)
        .all()
    ]

    # 🔥 delete logs first
    if step_ids:
        db.query(ShopTravelerStepLog).filter(
            ShopTravelerStepLog.step_id.in_(step_ids)
        ).delete(synchronize_session=False)

    # 🔥 delete steps
    db.query(ShopTravelerStep).filter(
        ShopTravelerStep.traveler_id == traveler_id
    ).delete(synchronize_session=False)

    db.commit()

    return {
        "message": "All traveler steps deleted"
    }