# routers/travelers.py
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, selectinload
from sqlalchemy import or_
from typing import List, Optional
from datetime import date

from database import get_db
from models import ShopTraveler, ProductionLot, Employee, TravelerTemplate
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

# ---------- Helpers ----------
def to_row_out(t: ShopTraveler) -> ShopTravelerRowOut:
    return ShopTravelerRowOut(
        id=t.id,
        traveler_no=t.traveler_no,
        lot_id=t.lot_id,
        lot_no=(t.lot.lot_no if t.lot else None),
        created_by_id=t.created_by_id,
        status=t.status,
        notes=t.notes,
        production_due_date=t.production_due_date,
        created_at=t.created_at.isoformat() if t.created_at else None,
    )

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
    return to_row_out(t)

# ---------- LIST ----------


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
        )
        .first()
    )

    if not tmpl:
        raise HTTPException(404, "No active template found")

    return {
        "id": tmpl.id,
        "template_name": tmpl.template_name,
        "version": tmpl.version,
    }

@router.get("", response_model=List[ShopTravelerRowOut])
def list_travelers(
    q: Optional[str] = Query(None, description="ค้นหา lot_code / lot_no"),
    lot_id: Optional[int] = Query(None, description="Filter by lot ID"),
    db: Session = Depends(get_db),
):
    query = db.query(ShopTraveler).options(selectinload(ShopTraveler.lot))

    # 🔍 ถ้ามี q (ค้นหาด้วย lot_no หรือ lot_code)
    if q:
        ql = f"%{q}%"
        query = (
            query.join(ShopTraveler.lot)
            .filter(or_(ProductionLot.lot_no.ilike(ql), ProductionLot.lot_code.ilike(ql)))
        )

    # 🔍 ถ้ามี lot_id (กรองเฉพาะ lot_id นั้น)
    if lot_id:
        query = query.filter(ShopTraveler.lot_id == lot_id)

    rows = query.order_by(ShopTraveler.id.desc()).all()
    return [to_row_out(t) for t in rows]
# ---------- GET ----------
@router.get("/by-lot-code/{lot_no}", response_model=ShopTravelerRowOut)
def get_traveler_by_lot_no(lot_no: str, db: Session = Depends(get_db)):
    """
    ดึง Traveler เดี่ยว พร้อม eager load lot
    """
    t = (
        db.query(ShopTraveler)
          .options(selectinload(ShopTraveler.lot))
          .join(ProductionLot)
          .filter(ProductionLot.lot_no == lot_no)
          .first()
    )
    if not t:
        raise HTTPException(404, "Traveler not found")
    return to_row_out(t)

@router.get("/{traveler_id}", response_model=ShopTravelerRowOut)
def get_traveler(traveler_id: int, db: Session = Depends(get_db)):
    """
    ดึง Traveler เดี่ยว พร้อม eager load lot
    """
    t = (
        db.query(ShopTraveler)
          .options(selectinload(ShopTraveler.lot))
          .filter(ShopTraveler.id == traveler_id)
          .first()
    )
    if not t:
        raise HTTPException(404, "Traveler not found")
    return to_row_out(t)





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
    return to_row_out(t)

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

from sqlalchemy.orm import Session, joinedload
from sqlalchemy.orm import joinedload
from fastapi import Depends, HTTPException
from sqlalchemy.orm import Session



@router.get("/by_no/{traveler_no}")
def get_traveler_by_no(traveler_no: str, seq: int | None = Query(None), db: Session = Depends(get_db)):
    """
    ดึงข้อมูล Traveler ตามหมายเลข traveler_no
    พร้อม steps ทั้งหมด และ step ปัจจุบัน (active)
    """
    print("str",traveler_no, seq)
    traveler = (
        db.query(ShopTraveler)
        .options(
            joinedload(ShopTraveler.steps).joinedload(ShopTravelerStep.operator)
        )
        .filter(ShopTraveler.traveler_no == traveler_no)
        .first()
    )

    if not traveler:
        raise HTTPException(status_code=404, detail="Traveler not found")
    
    # ---------- หา step ----------
    if seq is not None:
        # ✅ CASE: client ระบุ seq
        print("Seq provided:", seq)
        step = (
            db.query(ShopTravelerStep)
            .filter(ShopTravelerStep.traveler_id == traveler.id)
            .filter(ShopTravelerStep.seq == seq)
            .first()
        )

        if not step:
            print("Step not found for seq:", seq)
            step = (
                db.query(ShopTravelerStep)
                .filter(ShopTravelerStep.traveler_id == traveler.id)
                .filter(ShopTravelerStep.status.notin_(["passed", "failed", "skipped"]))
                .order_by(ShopTravelerStep.seq)
                .first()
            )
    else:
        print("No seq provided, finding active step")
        # ✅ CASE: default -> active step
        step = (
            db.query(ShopTravelerStep)
            .filter(ShopTravelerStep.traveler_id == traveler.id)
            .filter(ShopTravelerStep.status.notin_(["passed", "failed", "skipped"]))
            .order_by(ShopTravelerStep.seq)
            .first()
        )
    active_step = step
    print("Step selected:", step)
   
    return {
        "id": traveler.id,
        "traveler_no": traveler.traveler_no,
        "lot_id": traveler.lot_id,
        "status": traveler.status,
        "notes": traveler.notes,
        "active_step": {
            "id": active_step.id if active_step else None,
            "seq": active_step.seq if active_step else None,
            "station": active_step.station if active_step else None,
            "step_name": active_step.step_name if active_step else None,
            "step_note": active_step.step_note if active_step else None,
            "operator": {
            "id": active_step.operator.id if active_step and active_step.operator else None,
            "emp_code": active_step.operator.emp_code if active_step and active_step.operator else None,
            "emp_op": active_step.operator.emp_op if active_step and active_step.operator else None,
            "nickname": active_step.operator.nickname if active_step and active_step.operator else None,
        },

            "status": active_step.status if active_step else None,
        } if active_step else None,
        "steps": [
            {
                "id": s.id,
                "seq": s.seq,
                "station": s.station,
                "step_name": s.step_name,
                "status": s.status,
                "uom": s.uom,  # 👈 เพิ่มตรงนี้
                "qty_receive": s.qty_receive,
                "qty_accept": s.qty_accept,
                "qty_reject": s.qty_reject,
                "machine": s.machine_id,
                "operator": {
                    "id": s.operator.id if s.operator else None,
                    "emp_code": s.operator.emp_code if s.operator else None,
                    "emp_op": s.operator.emp_op if s.operator else None,
                    "nickname": s.operator.nickname if s.operator else None,
                },
            }
            for s in sorted(traveler.steps, key=lambda x: x.seq or 0)
        ],
    }


@router.get("/by-no/{traveler_no}/steps")
def get_traveler_steps_by_no(
    traveler_no: str,
    db: Session = Depends(get_db)
):
    """
    ดึง Traveler ตาม traveler_no พร้อม steps ทั้งหมด
    """
    traveler = (
        db.query(ShopTraveler)
        .options(
            joinedload(ShopTraveler.steps)
            .joinedload(ShopTravelerStep.operator)
        )
        .filter(ShopTraveler.traveler_no == traveler_no)
        .first()
    )

    if not traveler:
        raise HTTPException(status_code=404, detail="Traveler not found")

    return {
        "traveler_id": traveler.id,
        "traveler_no": traveler.traveler_no,
        "lot_id": traveler.lot_id,
        "status": traveler.status,
        "steps": [
            {
                "id": s.id,
                "seq": s.seq,
                "station": s.station,
                "step_name": s.step_name,
                "step_note": s.step_note,
                "status": s.status,
                "uom": s.uom,
                "qty_receive": s.qty_receive,
                "qty_accept": s.qty_accept,
                "qty_reject": s.qty_reject,
                "operator": {
                    "id": s.operator.id if s.operator else None,
                    "emp_code": s.operator.emp_code if s.operator else None,
                },
            }
            for s in sorted(traveler.steps, key=lambda x: x.seq or 0)
        ],
    }
# @router.get("/by_no/{traveler_no}")
# def get_traveler_by_no(traveler_no: str, db: Session = Depends(get_db)):
#     """
#     ดึงข้อมูล Traveler ตามหมายเลข traveler_no
#     พร้อม steps ทั้งหมด และ step ปัจจุบัน (active)
#     """
#     traveler = (
#         db.query(ShopTraveler)
#         .options(
#             joinedload(ShopTraveler.steps).joinedload(ShopTravelerStep.operator)
#         )
#         .filter(ShopTraveler.traveler_no == traveler_no)
#         .first()
#     )

#     if not traveler:
#         raise HTTPException(status_code=404, detail="Traveler not found")

#     # ✅ หา step ปัจจุบัน (ยังไม่ผ่าน)
#     active_step = (
#         db.query(ShopTravelerStep)
#         .filter(ShopTravelerStep.traveler_id == traveler.id)
#         .filter(ShopTravelerStep.status.notin_(["passed", "failed", "skipped"]))
#         .order_by(ShopTravelerStep.seq)
#         .first()
#     )

#     def fmt_station(s):
#         """สร้างชื่อ station เช่น OP#10 ถ้า station ว่าง"""
#         return s.station or f"OP#{s.seq}" if s else None

#     return {
#         "id": traveler.id,
#         "traveler_no": traveler.traveler_no,
#         "lot_id": traveler.lot_id,
#         "status": traveler.status,
#         "notes": traveler.notes,
#         "active_step": {
#             "id": active_step.id if active_step else None,
#             "seq": active_step.seq if active_step else None,
#             "station": fmt_station(active_step),
#             "step_name": active_step.step_name if active_step else None,
#             "step_note": active_step.step_note if active_step else None,
#             "operator_name": (
#                 active_step.operator.emp_code if active_step and active_step.operator else None
#             ),
#             "status": active_step.status if active_step else None,
#         } if active_step else None,
#         "steps": [
#             {
#                 "id": s.id,
#                 "seq": s.seq,
#                 "station": fmt_station(s),
#                 "step_name": s.step_name,
#                 "status": s.status,
#                 "qty_receive": s.qty_receive,
#                 "qty_accept": s.qty_accept,
#                 "qty_reject": s.qty_reject,
#                 "operator": {
#                     "id": s.operator.id if s.operator else None,
#                     "emp_code": s.operator.emp_code if s.operator else None,
#                 },
#             }
#             for s in sorted(traveler.steps, key=lambda x: x.seq or 0)
#         ],
#     }

@router.post("/by_no/{traveler_no}/record")
def record_traveler_operation(
    traveler_no: str,
    payload: dict,
    db: Session = Depends(get_db)
):
    traveler = (
        db.query(ShopTraveler)
        .filter(ShopTraveler.traveler_no == traveler_no)
        .first()
    )
    if not traveler:
        raise HTTPException(status_code=404, detail=f"Traveler {traveler_no} not found")

    step = (
        db.query(ShopTravelerStep)
        .filter(ShopTravelerStep.traveler_id == traveler.id)
        .filter(ShopTravelerStep.status.notin_(["passed", "failed", "skipped"]))
        .order_by(ShopTravelerStep.seq)
        .first()
    )
    if not step:
        raise HTTPException(status_code=404, detail="No active step found")

    # ✅ update ข้อมูลจาก operator
    step.qty_receive = payload.get("qty_receive", step.qty_receive)
    step.qty_accept = payload.get("qty_accept", step.qty_accept)
    step.qty_reject = payload.get("qty_reject", step.qty_reject)
    step.step_note = payload.get("remark", step.step_note)
    step.status = "passed"
    step.finished_at = func.now()

    # ✅ หา next step แล้วเปิดให้เป็น in_progress
    next_step = (
        db.query(ShopTravelerStep)
        .filter(ShopTravelerStep.traveler_id == traveler.id)
        .filter(ShopTravelerStep.seq > step.seq)
        .order_by(ShopTravelerStep.seq)
        .first()
    )
    if next_step and next_step.status.lower() == "pending":
        next_step.status = "in_progress"
        next_step.started_at = func.now()

    db.commit()
    return {
        "message": f"Traveler {traveler_no} step {step.seq} marked as PASSED",
        "next_step": next_step.seq if next_step else None
    }

# ---------- UPDATE SINGLE TRAVELER STEP ----------
from pydantic import BaseModel
from typing import Optional

class TravelerStepUpdate(BaseModel):
    qty_receive: Optional[int] = None
    qty_accept: Optional[int] = None
    qty_reject: Optional[int] = None
    step_note: Optional[str] = None
    remark: Optional[str] = None  # ใช้ชื่อเดียวกับ frontend
    status: Optional[str] = None
    operator_code: Optional[str] = None  # 👈 change name

@router.patch("/traveler_steps/{step_id}")
def update_traveler_step(step_id: int, payload: TravelerStepUpdate, db: Session = Depends(get_db)):
    step = db.get(ShopTravelerStep, step_id)
    if not step:
        raise HTTPException(status_code=404, detail="Step not found")

    # ✅ remark updates only note
    if payload.remark is not None:
        step.step_note = payload.remark

    # ✅ numeric fields
    if payload.qty_receive is not None:
        step.qty_receive = payload.qty_receive
    if payload.qty_accept is not None:
        step.qty_accept = payload.qty_accept
    if payload.qty_reject is not None:
        step.qty_reject = payload.qty_reject
    if payload.status is not None:
        step.status = payload.status
    if payload.step_note is not None:
        step.step_note = payload.step_note

    # ✅ operator_code handled separately and only if not empty
    if payload.operator_code is not None and str(payload.operator_code).strip() != "":
        emp = db.query(Employee).filter(Employee.emp_code == payload.operator_code).first()
        if not emp:
            raise HTTPException(status_code=404, detail=f"Employee code {payload.operator_code} not found")
        step.operator_id = emp.id

    db.commit()
    db.refresh(step)
    return {
        "id": step.id,
        "seq": step.seq,
        "qty_receive": step.qty_receive,
        "qty_accept": step.qty_accept,
        "qty_reject": step.qty_reject,
        "status": step.status,
        "step_note": step.step_note,
        "operator_id": step.operator_id,
    }

def apply_template_to_traveler(
    db: Session,
    traveler_id: int,
    template_id: int,
    applied_by_id: int | None = None,
):
    traveler = db.get(ShopTraveler, traveler_id)
    if not traveler:
        raise ValueError("Traveler not found")

    # 🔒 ป้องกัน replace หลังเริ่มงาน
    started_steps = (
        db.query(ShopTravelerStep)
        .filter(
            ShopTravelerStep.traveler_id == traveler_id,
            ShopTravelerStep.status != "pending",
        )
        .count()
    )

    if started_steps > 0:
        raise ValueError("Cannot replace steps after production started")

    template = (
        db.query(TravelerTemplate)
        .filter(
            TravelerTemplate.id == template_id,
            TravelerTemplate.is_active.is_(True),
        )
        .first()
    )

    if not template:
        raise ValueError("Template not found or inactive")

    # 1️⃣ ลบ step เดิมทั้งหมด
    (
        db.query(ShopTravelerStep)
        .filter(ShopTravelerStep.traveler_id == traveler.id)
        .delete(synchronize_session=False)
    )

    db.flush()

    # 2️⃣ ใส่ step ใหม่ทั้งหมด
    for step in template.steps:
        db.add(
            ShopTravelerStep(
                traveler_id=traveler.id,
                seq=step.seq,
                step_code=step.step_code,
                step_name=step.step_name,
                station=step.station,
                qa_required=step.qa_required,
                status="pending",
                step_detail=step.step_detail or "", 
            )
        )

    # 3️⃣ reset traveler state
    traveler.current_step_seq = template.steps[0].seq if template.steps else None
    traveler.status = "open"

    db.commit()
    return traveler


@router.post("/apply-template/{traveler_id}")
def apply_template(
    traveler_id: int,
    template_id: int = Query(...),
    db: Session = Depends(get_db),
    
):
    print("Applied template to traveler:", traveler_id, template_id )
    traveler = apply_template_to_traveler(
        db=db,
        traveler_id=traveler_id,
        template_id=template_id,
        applied_by_id=None,
    )
    
    # return {"ok": True, "traveler_id": traveler.id}
    return {"ok": True}

