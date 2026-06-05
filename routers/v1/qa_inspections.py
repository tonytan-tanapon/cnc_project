# routers/qa_inspections.py
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from pydantic import BaseModel

class QAInspectionUpdate(BaseModel):
    inspector_id: int | None = None

from doc.docx_to_db import (
    convert_doc_to_docx,
)
from doc.inspection.docx_to_db import (
    parse_docx_to_rows,
)

from database import get_db
from models import QAInspection, QAInspectionItem,ProductionLot
from schemas import (
    QAInspectionCreate,
    QAInspectionItemCreate,
    QAInspectionItemUpdate,
)

router = APIRouter(prefix="/qa-inspections", tags=["qa-inspections"])


@router.put("/{inspection_id}")
def update_inspection(
    inspection_id: int,
    payload: QAInspectionUpdate,
    db: Session = Depends(get_db),
):
    qa = db.get(QAInspection, inspection_id)

    if not qa:
        raise HTTPException(404, "Inspection not found")

    qa.inspector_id = payload.inspector_id

    db.commit()
    db.refresh(qa)

    return qa

@router.get("/by-lot/{lot_id}")
def get_inspection(lot_id: int, db: Session = Depends(get_db)):
    qa = (
        db.query(QAInspection)
        .filter(QAInspection.lot_id == lot_id)
        .first()
    )
    return qa

@router.post("")
def create_inspection(payload: QAInspectionCreate, db: Session = Depends(get_db)):
    qa = QAInspection(
        lot_id=payload.lot_id,
        inspector_id=payload.inspector_id,
        remarks=payload.remarks,
    )
    db.add(qa)
    db.commit()
    db.refresh(qa)
    return qa



@router.get("/{inspection_id}/items")
def get_items(inspection_id: int, db: Session = Depends(get_db)):
    return (
        db.query(QAInspectionItem)
        .filter(QAInspectionItem.inspection_id == inspection_id)
        .order_by(QAInspectionItem.seq)
        .all()
    )


@router.post("/{inspection_id}/items")
def add_item(
    inspection_id: int,
    payload: QAInspectionItemCreate,
    db: Session = Depends(get_db),
):
    item = QAInspectionItem(
        inspection_id=inspection_id,
        **payload.dict()
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return item

from datetime import datetime
import pytz

from datetime import datetime
import pytz

from datetime import datetime
import pytz



@router.put("/qa-items/{item_id}")
def update_item(item_id: int, payload: QAInspectionItemUpdate, db: Session = Depends(get_db)):
    item = db.get(QAInspectionItem, item_id)
    if not item:
        raise HTTPException(404, "Item not found")

    from datetime import datetime
    import pytz

    la = pytz.timezone("America/Los_Angeles")

    updated_fields = payload.dict(exclude_unset=True)

    # apply update
    for k, v in updated_fields.items():
        setattr(item, k, v)

    # 🟢 1. user override
    if "qa_time_stamp" in updated_fields and updated_fields["qa_time_stamp"]:
        print("User set timestamp:", updated_fields["qa_time_stamp"])
        item.qa_time_stamp = updated_fields["qa_time_stamp"]

    # 🟡 2. auto update
    elif "actual_value" in updated_fields or "tqw" in updated_fields:
        print("Auto update timestamp")
        item.qa_time_stamp = datetime.now(la)

    print("Updated item", item.id, "qa_time_stamp:", item.qa_time_stamp)

    db.commit()
    db.refresh(item)
    return item

@router.delete("/qa-items/{item_id}")
def delete_item(item_id: int, db: Session = Depends(get_db)):
    item = db.get(QAInspectionItem, item_id)
    if not item:
        raise HTTPException(404, "Item not found")

    db.delete(item)
    db.commit()
    return {"ok": True}

@router.delete("/{inspection_id}/items")
def delete_all_items(
    inspection_id: int,
    db: Session = Depends(get_db),
):
    inspection = db.get(
        QAInspection,
        inspection_id
    )

    if not inspection:
        raise HTTPException(
            404,
            "Inspection not found"
        )

    db.query(QAInspectionItem)\
        .filter(
            QAInspectionItem.inspection_id == inspection_id
        )\
        .delete()

    # 🔥 clear file_dir ด้วย
    inspection.file_dir = None

    db.commit()

    return {
        "success": True
    }

from models import (
    QAInspection,
    QAInspectionItem,
    QAInspectionTemplate,
    QAInspectionTemplateItem,
)

@router.get("/templates/active")
def get_active_template(inspection_id: int, db: Session = Depends(get_db)):
    print(f"Getting active template for inspection {inspection_id}")
    # 1. หา inspection
    inspection = db.get(QAInspection, inspection_id)
    if not inspection:
        raise HTTPException(404, "Inspection not found")

    # 2. หา lot
    lot = inspection.lot
    if not lot:
        raise HTTPException(400, "Inspection has no lot")

    # 3. filter template ตาม part + rev
    tmpl = (
        db.query(QAInspectionTemplate)
        .filter(QAInspectionTemplate.active == True)
        .filter(QAInspectionTemplate.part_id == lot.part_id)
        .filter(QAInspectionTemplate.rev_id == lot.part_revision_id)
        .first()
    )

    if not tmpl:
        raise HTTPException(404, "No active template for this part/rev")

    return tmpl

@router.post("/apply-template/{inspection_id}")
def apply_template(
    inspection_id: int,
    template_id: int,
    db: Session = Depends(get_db),
):
    inspection = db.get(QAInspection, inspection_id)
    if not inspection:
        raise HTTPException(404, "Inspection not found")

    items = (
        db.query(QAInspectionTemplateItem)
        .filter(QAInspectionTemplateItem.template_id == template_id)
        .order_by(QAInspectionTemplateItem.seq)
        .all()
    )

    if not items:
        raise HTTPException(404, "Template has no items")

    # ลบ item เก่า
    db.query(QAInspectionItem).filter(
        QAInspectionItem.inspection_id == inspection_id
    ).delete()

    # copy item จาก template
    for it in items:
        new_item = QAInspectionItem(
            inspection_id=inspection_id,
            seq=it.seq,
            op_no=it.op_no,
            bb_no=it.bb_no,
            dimension=it.dimension,
            actual_value=None,
            result=None,
            notes=None,
            emp_id=38,
            qa_time_stamp=None,   # ✅ เพิ่มตรงนี้
               
        )
        db.add(new_item)

    tmpl = db.get(
    QAInspectionTemplate,
    template_id
    )

    inspection.file_dir = tmpl.file_dir

    db.commit()
    db.refresh(inspection)

    return {"ok": True, "count": len(items)}

# qa_inspections/${inspectionId}/create-template-version
@router.post("/{inspection_id}/create-template-version")
def create_template_version(
    inspection_id: int,
    db: Session = Depends(get_db),
):
    print("Creating template version from inspection", inspection_id)

    from sqlalchemy.orm import joinedload
    from sqlalchemy import func

    # =========================
    # 1. LOAD INSPECTION + LOT
    # =========================
    inspection = (
        db.query(QAInspection)
        .options(
            joinedload(QAInspection.lot)
            .joinedload(ProductionLot.part),
            joinedload(QAInspection.lot)
            .joinedload(ProductionLot.part_revision),
        )
        .filter(QAInspection.id == inspection_id)
        .first()
    )

    if not inspection:
        raise HTTPException(404, "Inspection not found")

    lot = inspection.lot
    if not lot:
        raise HTTPException(400, "Inspection has no lot")

    # =========================
    # 2. LOAD ITEMS
    # =========================
    items = (
        db.query(QAInspectionItem)
        .filter(QAInspectionItem.inspection_id == inspection_id)
        .order_by(QAInspectionItem.seq)
        .all()
    )

    if not items:
        raise HTTPException(404, "Inspection has no items")

    try:
        # =========================
        # 3. CALCULATE VERSION
        # =========================
        last_version = (
            db.query(func.max(QAInspectionTemplate.version))
            .filter(QAInspectionTemplate.part_id == lot.part_id)
            .filter(QAInspectionTemplate.rev_id == lot.part_revision_id)
            .scalar()
        ) or 0

        new_version = last_version + 1

        # =========================
        # 4. DISABLE OLD TEMPLATE
        # =========================
        db.query(QAInspectionTemplate).filter(
            QAInspectionTemplate.part_id == lot.part_id,
            QAInspectionTemplate.rev_id == lot.part_revision_id,
        ).update({QAInspectionTemplate.active: False})

        # =========================
        # 5. CREATE TEMPLATE
        # =========================
        tmpl = QAInspectionTemplate(
            part_id=lot.part_id,
            rev_id=lot.part_revision_id,
            version=new_version,
            step_code=None,
            name=f"Template from Inspection {inspection.id} (Lot {lot.lot_no})",
            active=True,
            is_latest=True,   # 🔥 เพิ่มตรงนี้
            file_dir=inspection.file_dir
        )
        db.add(tmpl)
        db.flush()   # 🔥 สำคัญ: ได้ tmpl.id โดยยังไม่ commit

        # =========================
        # 6. COPY ITEMS
        # =========================
        
        for it in items:

           
            db.add(QAInspectionTemplateItem(
                template_id=tmpl.id,
                seq=it.seq,
                op_no=it.op_no or "",
                bb_no=it.bb_no or "",
                dimension=(it.dimension or "").strip(),
            ))

        # =========================
        # 7. COMMIT ALL
        # =========================
        db.commit()

        return {
            "ok": True,
            "template_id": tmpl.id,
            "version": new_version,
            "item_count": len(items),
        }

    except Exception as e:
        db.rollback()
        print("❌ create_template_version error:", e)
        raise HTTPException(500, str(e))
    
from fastapi import (
    Depends,
    HTTPException,
    UploadFile,
    File,
    Form,
)

from pathlib import Path
from tempfile import NamedTemporaryFile
from sqlalchemy.orm import joinedload

@router.post("/import")
async def import_inspection(
    inspection_id: int = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):

    print("📥 Import inspection")

    try:

        # =========================
        # VALIDATE
        # =========================
        filename = (file.filename or "").lower()

        if not (
            filename.endswith(".docx") or
            filename.endswith(".doc")
        ):

            raise HTTPException(
                400,
                "Only .doc/.docx supported"
            )

        # =========================
        # LOAD INSPECTION
        # =========================
        inspection = (
            db.query(QAInspection)
            .options(
                joinedload(QAInspection.lot)
                .joinedload(ProductionLot.part),

                joinedload(QAInspection.lot)
                .joinedload(
                    ProductionLot.part_revision
                ),
            )
            .filter(
                QAInspection.id == inspection_id
            )
            .first()
        )

        if not inspection:
            raise HTTPException(
                404,
                "Inspection not found"
            )

        lot = inspection.lot

        if not lot:
            raise HTTPException(
                400,
                "Inspection has no lot"
            )

        # =========================
        # SAVE TEMP FILE
        # =========================
        content = await file.read()

        suffix = Path(filename).suffix

        with NamedTemporaryFile(
            delete=False,
            suffix=suffix
        ) as tmp:

            tmp.write(content)

            tmp.flush()

            temp_path = Path(tmp.name)

        print("Temp path:", temp_path)

        print("File exists:", temp_path.exists())

        print(
            "File size:",
            temp_path.stat().st_size
        )

        # =========================
        # DOC -> DOCX
        # =========================
        if suffix == ".doc":

            print("🔄 converting .doc")

            temp_path = convert_doc_to_docx(
                temp_path
            )

            print(
                "✅ converted:",
                temp_path
            )

        # =========================
        # VALIDATE DOCX
        # =========================
        from docx import Document

        Document(str(temp_path))

        print("✅ DOCX opened OK")

        # =========================
        # PARSE DOCX
        # =========================
        rows = parse_docx_to_rows(
            str(temp_path)
        )

        print("Parsed rows:", rows)

        if not rows:

            raise HTTPException(
                400,
                "No inspection rows found"
            )

        # =========================
        # SAME DAY VERSION
        # =========================
        from datetime import datetime
        import pytz

        la = pytz.timezone(
            "America/Los_Angeles"
        )

        version = int(
            datetime.now(la).strftime(
                "%Y%m%d"
            )
        )

        # =========================
        # FIND EXISTING TEMPLATE
        # =========================
        tmpl = (
            db.query(QAInspectionTemplate)
            .filter(
                QAInspectionTemplate.part_id ==
                    lot.part_id,

                QAInspectionTemplate.rev_id ==
                    lot.part_revision_id,

                QAInspectionTemplate.version ==
                    version,
            )
            .first()
        )

        # =========================
        # REPLACE SAME DAY
        # =========================
        if tmpl:

            print(
                "♻️ Replacing existing template"
            )

            tmpl.active = True
            tmpl.is_latest = True

            db.query(
                QAInspectionTemplateItem
            ).filter(
                QAInspectionTemplateItem
                .template_id == tmpl.id
            ).delete()

            db.flush()

        # =========================
        # CREATE NEW TEMPLATE
        # =========================
        else:

            print(
                "🆕 Creating new template"
            )

            db.query(
                QAInspectionTemplate
            ).filter(
                QAInspectionTemplate.part_id ==
                    lot.part_id,

                QAInspectionTemplate.rev_id ==
                    lot.part_revision_id,
            ).update({

                QAInspectionTemplate.active:
                    False,

                QAInspectionTemplate.is_latest:
                    False,
            })

            tmpl = QAInspectionTemplate(

                part_id=lot.part_id,

                rev_id=lot.part_revision_id,

                version=version,

                name=(
                    f"{lot.part.part_no} "
                    f"REV "
                    f"{lot.part_revision.rev if lot.part_revision else '-'} "
                    f"V{version}"
                ),

                active=True,

                is_latest=True,
                file_dir=file.filename,   # หรือ path จริง
            )

            db.add(tmpl)

            db.flush()

        # =========================
        # INSERT TEMPLATE ITEMS
        # =========================
        seq = 1

        for row in rows:

            op = row.get("Op#")

            for b in row.get(
                "Bubble",
                []
            ):

                bb = b.get("bb")
                dim = b.get("dimension")

                if not bb:
                    continue

                db.add(
                    QAInspectionTemplateItem(

                        template_id=tmpl.id,

                        seq=seq,

                        op_no=op or "",

                        bb_no=bb or "",

                        dimension=(
                            dim or ""
                        ).strip(),
                    )
                )

                seq += 1

        db.flush()

        # =========================
        # APPLY TEMPLATE
        # =========================
        db.query(QAInspectionItem)\
            .filter(
                QAInspectionItem.inspection_id ==
                    inspection_id
            )\
            .delete()

        db.flush()

        template_items = (
            db.query(
                QAInspectionTemplateItem
            )
            .filter(
                QAInspectionTemplateItem
                .template_id == tmpl.id
            )
            .order_by(
                QAInspectionTemplateItem.seq
            )
            .all()
        )

        for it in template_items:

            db.add(
                QAInspectionItem(

                    inspection_id=
                        inspection_id,

                    seq=it.seq,

                    op_no=it.op_no,

                    bb_no=it.bb_no,

                    dimension=it.dimension,
                    qa_time_stamp=None,   # ✅ สำคัญ
                    emp_id=38,   # ✅ ADD
                )
            )
            
        inspection.file_dir = tmpl.file_dir

        db.commit()

        return {

            "success": True,

            "template_id": tmpl.id,

            "version": tmpl.version,

            "count": len(template_items),
        }

    except Exception as e:

        db.rollback()

        print(
            "❌ import inspection error:",
            e
        )

        raise HTTPException(
            500,
            str(e)
        )