from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload
from fastapi.responses import FileResponse
from database import get_db
from models import ShopTraveler, ProductionLot, Part, PartRevision, PO, Customer,ShopTravelerStep, QAInspection, QAInspectionItem
import os
import tempfile
from datetime import datetime
from routers.v1.travelers import to_row_out

from utils.traveler_utils import calculate_traveler_steps
router = APIRouter(prefix="/traveler_drawing", tags=["traveler_drawing"])


@router.get("/traveler/{traveler_id}/full")
def get_traveler_full(traveler_id: int, db: Session = Depends(get_db)):

    t = (
        db.query(ShopTraveler)
        .options(
            joinedload(ShopTraveler.lot).joinedload(ProductionLot.part),
            joinedload(ShopTraveler.lot).joinedload(ProductionLot.part_revision),
            joinedload(ShopTraveler.lot)
                .joinedload(ProductionLot.po)
                .joinedload(PO.customer),
        )
        .filter(ShopTraveler.id == traveler_id)
        .first()
    )

    if not t:
        raise HTTPException(404, "Traveler not found")

    lot = t.lot
    part = lot.part if lot else None
    rev = lot.part_revision if lot else None
    po = lot.po if lot else None
    cust = po.customer if po else None

    return {
        "lot": {"lot_no": lot.lot_no},
        "part": {"part_no": part.part_no},
        "revision": {"rev": rev.rev},
        "po": {
            "customer_code": cust.code if cust else None,
        }
    }


def latest_file(folder, prefix, extensions=["pdf"]):
    """
    คืนค่าชื่อไฟล์ล่าสุดที่ขึ้นต้นด้วย prefix และลงท้ายด้วยประเภทไฟล์ใน extensions
    เช่น extensions=["pdf", "dxf"]
    """

    if not os.path.exists(folder):
        return None

    # แปลง extension ให้เป็นรูปแบบ .pdf / .dxf / .dwg
    exts = [f".{ext.lower().lstrip('.')}" for ext in extensions]

    files = [
        f for f in os.listdir(folder)
        if f.startswith(prefix) and any(f.lower().endswith(ext) for ext in exts)
    ]

    def extract_date(fname):
        # ตัด prefix + นามสกุลออก แล้ว parse วันที่
        name_part = fname.replace(prefix, "")
        for ext in exts:
            name_part = name_part.replace(ext, "")
        name_part = name_part.strip()

        try:
            return datetime.strptime(name_part, "%m-%d-%y")
        except:
            return datetime.min

    files.sort(key=extract_date, reverse=True)
    return files[0] if files else None



@router.post("/drawing/{traveler_id}")
def build_drawing_batch(traveler_id: int, db: Session = Depends(get_db)):

    # print(f"Building drawing batch for traveler {traveler_id}")
    data = get_traveler_full(traveler_id, db)

    lot_no = data["lot"]["lot_no"]
    part_no = data["part"]["part_no"]
    rev = data["revision"]["rev"]
    cus_code = data["po"]["customer_code"]

    year = datetime.now().year
    # Z:\Topnotch Group\Public\AS9100\Shop Traveler\Control Drawing for Production\SA8884
    # folder = f"Z:/Topnotch Group/Public/AS9100/Shop Traveler/Control Drawing for Production/{cus_code}/"
    # folder2 = f"Z:/Public/AS9100/Shop Traveler/Control Drawing for Production/{cus_code}/"
    # folder = f"Z:/Topnotch Group/Public/{year}/Drawing Diagram {year}/{cus_code}"

    # prefix = f"{part_no} {rev}"
    # latest = latest_file(folder, prefix)
    # # ❌ ถ้าไม่เจอไฟล์ → ส่ง 404 พร้อมข้อความสวย ๆ
    # if not latest:
    #     raise HTTPException(
    #         status_code=404,
    #         detail=f"No inspection file found for {part_no} Rev {rev} in {folder}"
    #     )
    # pdf_path = os.path.join(folder, latest) if latest else None
    # print(f"Searching in folder: {folder}")
    # print(f"Latest PDF: {pdf_path}")
    # bat = [
    #     "@echo off",
    #     f"echo Lot: {lot_no}",
    #     f"echo Part: {part_no}",
    #     f"echo Rev: {rev}",
    #     f"echo Customer: {cus_code}",
    #     "",
         
    #     f'start "" "{folder}"',

    # ]


    print(f"Building .bat for drawing open...")


    if cus_code == "BE5503":
        cus_code_folder = "BEI"
    if cus_code == "SA8884":
        cus_code_folder = "Skurka all drawing are restrict for export controlled cannot send via email"
    if cus_code == "AF6182":
        cus_code_folder = "Aero Fluid"
    if cus_code == "AA4519":
        cus_code_folder = "Atomic"
    if cus_code == "AT9110":
        cus_code_folder = "Ametek"
   
       
    bat = [
        "@echo off",
        f"echo Lot: {lot_no}",
        f"echo Part: {part_no}",
        f"echo Rev: {rev}",
        f"echo Customer: {cus_code}",
        "",

        # ---- Variables ----
        f"set PART={part_no}",
        f"set REV={rev or ''}",
        "",

        # ---- Folder candidates ----
        # f'set PATH1=Z:\\Public\\AS9100\\Shop Traveler\\Control Drawing for Production\\{cus_code}',
        # f'set PATH2=Z:\\Topnotch Group\\Public\\AS9100\\Shop Traveler\\Control Drawing for Production\\{cus_code}',

        f'set PATH1=Z:\\Public\\Blue Print\\{cus_code_folder}\\Ballooned Drawing',
        f'set PATH2=Z:\\Topnotch Group\\Public\\Blue Print\\{cus_code_folder}\\Ballooned Drawing',
        "",

        # ---- Try open PDF ----
        'set FOUND=0',
        'for %%P in ("%PATH1%" "%PATH2%") do (',
        '  if exist "%%~P" (',
        '    for %%F in ("%%~P\\%PART% %REV%*.pdf") do (',
        '      echo Opening %%F',
        '      start "" "%%F"',
        '      set FOUND=1',
        '      goto :EOF',
        '    )',
        '  )',
        ')',
        "",

        # ---- Fallback: open folder ----
        'if "%FOUND%"=="0" (',
        '  echo PDF not found. Opening folder...',
        '  if exist "%PATH1%" (',
        '    start "" "%PATH1%"',
        '  ) else if exist "%PATH2%" (',
        '    start "" "%PATH2%"',
        '  ) else (',
        '    echo Folder not found.',
        '    pause',
        '  )',
        ')',
    ]
   
    # if pdf_path:
    
    #     bat.append(f'start "" "{folder}"')
    # else:
    #     bat.append("echo PDF not found.")
    # print(bat)
    filename = f"drawing_{lot_no}.bat"

    # ใช้ temp folder ของ Windows
    tmp = os.path.join(tempfile.gettempdir(), filename)

    with open(tmp, "w", encoding="utf-8") as f:
        f.write("\r\n".join(bat))

    return FileResponse(tmp, filename=filename)



@router.post("/traveletdoc/{traveler_id}")
def build_traveler_doc_batch(traveler_id: int, db: Session = Depends(get_db)):

    # print(f"Building drawing batch for traveler {traveler_id}")
    data = get_traveler_full(traveler_id, db)

    lot_no = data["lot"]["lot_no"]
    part_no = data["part"]["part_no"]
    rev = data["revision"]["rev"]
    cus_code = data["po"]["customer_code"]

    year = datetime.now().year
    # Z:\Topnotch Group\Public\AS9100\Shop Traveler\Control Drawing for Production\SA8884
    
    # folder = f"Z:/Topnotch Group/Public/AS9100/Shop Traveler/SHOP TRAVELER/{cus_code}/{part_no} {rev}/"
    folder = f"Z:/Topnotch Group/Public/AS9100/Shop Traveler/SHOP TRAVELER/{cus_code}/"
    # folder = f"Z:/Topnotch Group/Public/{year}/Drawing Diagram {year}/{cus_code}"

    # prefix = f"{lot_no}"
    # latest = latest_file(folder, prefix,["doc"])

    # # ❌ ถ้าไม่เจอไฟล์ → ส่ง 404 พร้อมข้อความสวย ๆ
    # if not latest:
    #     raise HTTPException(
    #         status_code=404,
    #         detail=f"No inspection file found for {part_no} Rev {rev} in {folder}"
    #     )
    # pdf_path = os.path.join(folder, latest) if latest else None
    # print(f"Searching in folder: {folder}")

    # print(prefix)
    # print(f"Latest PDF: {pdf_path}")

    if cus_code == "BE5503":
        cus_code_folder = "BEI"
    if cus_code == "SA8884":
        cus_code_folder = "Skurka all drawing are restrict for export controlled cannot send via email"
    if cus_code == "AF6182":
        cus_code_folder = "Aero Fluid"
    if cus_code == "AA4519":
        cus_code_folder = "Atomic"
    if cus_code == "AT9110":
        cus_code_folder = "Ametek"
    if cus_code == "BE5503":
        cus_code_folder = "BEI"
    if cus_code == "BE5503":
        cus_code_folder = "BEI"
    if cus_code == "BE5503":
        cus_code_folder = "BEI"

    bat = [
        "@echo off",
        f"echo Lot: {lot_no}",
        f"echo Part: {part_no}",
        f"echo Rev: {rev}",
        f"echo Customer: {cus_code}",
        "",

        # ---- Variables ----
        f"set LOT={lot_no}",
        f"set PART={part_no}",
        f"set REV={rev or ''}",
        "",

        # ---- Base paths ----
        # f'set BASE1=Z:\\Public\\AS9100\\Shop Traveler\\SHOP TRAVELER\\{cus_code}',
        # f'set BASE2=Z:\\Topnotch Group\\Public\\AS9100\\Shop Traveler\\SHOP TRAVELER\\{cus_code}',

        # Z:\Topnotch Group\Public\Blue Print\Aero Fluid
        f'set BASE1=Z:\\Public\\Blue Print\\{cus_code}\\Ballooned Drawing',
        f'set BASE2=Z:\\Topnotch Group\\Public\\Blue Print\\{cus_code}\\Ballooned Drawing',
        "",

        # ---- Subfolder candidates (with & without rev) ----
        'set SUB1=%PART% %REV%',
        'set SUB2=%PART%',
        "",

        # ---- Try open file ----
        'set FOUND=0',
        'for %%B in ("%BASE1%" "%BASE2%") do (',
        '  for %%S in ("%SUB1%" "%SUB2%") do (',
        '    if exist "%%~B\\%%~S" (',
        '      for %%F in ("%%~B\\%%~S\\%LOT%*.doc*") do (',
        '        echo Opening %%F',
        '        start "" "%%F"',
        '        set FOUND=1',
        '        goto :EOF',
        '      )',
        '    )',
        '  )',
        ')',
        "",

        # ---- Fallback: open folder ----
        'if "%FOUND%"=="0" (',
        '  echo File not found. Opening folder...',
        '  if exist "%BASE1%" (',
        '    start "" "%BASE1%"',
        '  ) else if exist "%BASE2%" (',
        '    start "" "%BASE2%"',
        '  ) else (',
        '    echo Folder not found.',
        '    pause',
        '  )',
        ')',
    ]


    # if pdf_path:
        
    #     bat.append(f'start "" "{folder}"')
    # else:
    #     bat.append("echo PDF not found.")
    print(bat)
    filename = f"traveler_{lot_no}.bat"

    # ใช้ temp folder ของ Windows
    tmp = os.path.join(tempfile.gettempdir(), filename)

    with open(tmp, "w", encoding="utf-8") as f:
        f.write("\r\n".join(bat))

    return FileResponse(tmp, filename=filename)



from fastapi import HTTPException
import tempfile

@router.post("/inspection/{traveler_id}")
def build_inspection_batch(traveler_id: int, db: Session = Depends(get_db)):
 
    print(f"Building inspection batch for traveler {traveler_id}")
    data = get_traveler_full(traveler_id, db)

    lot_no = data["lot"]["lot_no"]
    part_no = data["part"]["part_no"]
    rev = data["revision"]["rev"]
    cus_code = data["po"]["customer_code"]

    year = datetime.now().year
    # folder = f"Z:/Topnotch Group/Public/AS9100/Shop Traveler/INSPECT WIP Report/{cus_code}/{part_no} {rev}/"
    folder = f"Z:/Topnotch Group/Public/AS9100/Shop Traveler/INSPECT WIP Report/{cus_code}/"
    # prefix = f"{part_no} {rev}"
    # latest = latest_file(folder, prefix, ["doc"])

    # # ❌ ถ้าไม่เจอไฟล์ → ส่ง 404 พร้อมข้อความสวย ๆ
    # if not latest:
    #     raise HTTPException(
    #         status_code=404,
    #         detail=f"No inspection file found for {part_no} Rev {rev} in {folder}"
    #     )

    # pdf_path = os.path.join(folder, latest)
    # print(f"Found file: {pdf_path}")

    # ---------- build .bat ----------
    bat = [
        "@echo off",
        f"echo Lot: {lot_no}",
        f"echo Part: {part_no}",
        f"echo Rev: {rev}",
        f"echo Customer: {cus_code}",
        "",

        # ---- Variables ----
        f"set LOT={lot_no}",
        f"set PART={part_no}",
        f"set REV={rev or ''}",
        "",

        # ---- Base path candidates ----
        f"set BASE1=Z:\\Public\\AS9100\\Shop Traveler\\INSPECT WIP Report\\{cus_code}",
        f"set BASE2=Z:\\Topnotch Group\\Public\\AS9100\\Shop Traveler\\INSPECT WIP Report\\{cus_code}",
        "",

        # ---- Build subfolder candidates ----
        'set SUB1=%PART% %REV%',
        'set SUB2=%PART%',
        "",

        # ---- Try open file first ----
        'set FOUND=0',
        'for %%B in ("%BASE1%" "%BASE2%") do (',
        '  for %%S in ("%SUB1%" "%SUB2%") do (',
        '    if exist "%%~B\\%%~S" (',
        '      for %%F in ("%%~B\\%%~S\\%LOT%*.doc*") do (',
        '        echo Opening file: %%F',
        '        start "" "%%F"',
        '        set FOUND=1',
        '        goto :EOF',
        '      )',
        '    )',
        '  )',
        ')',
        "",

        # ---- If file not found, open folder ----
        'if "%FOUND%"=="0" (',
        '  echo File not found. Opening folder...',
        '  if exist "%BASE1%" (',
        '    start "" "%BASE1%"',
        '  ) else if exist "%BASE2%" (',
        '    start "" "%BASE2%"',
        '  ) else (',
        '    echo Folder not found.',
        '    pause',
        '  )',
        ')',
    ]

    # print(bat)
    filename = f"inspection_{lot_no}.bat"
    tmp = os.path.join(tempfile.gettempdir(), filename)

    with open(tmp, "w", encoding="utf-8") as f:
        f.write("\r\n".join(bat))

    return FileResponse(tmp, filename=filename)


def build_traveler_data_from_db(traveler: ShopTraveler,db: Session) -> dict:

    traveler_row = to_row_out(
        traveler,
        db
    )

    

    print("traveler_row", traveler_row)

    lot = traveler.lot
    po = lot.po
    customer = po.customer if po else None

    steps = []
    sorted_steps = sorted(
        traveler.steps,
        key=lambda s: (
            0 if str(s.step_code).startswith("M") else 1,
            int(
                ''.join(
                    filter(str.isdigit, str(s.step_code))
                ) or 999999
            )
        )
    )

    step_data = calculate_traveler_steps(sorted_steps)

    # =================================
    # USE PART FROM LOT ?
    # =================================
    use_part_from_lot = False

    op010_accept = 0

    for item in step_data:

        s = item["step"]

        if str(s.step_code) == "010":

            detail = (s.step_name or "").upper()

            if "FROM LOT" in detail:

                use_part_from_lot = True

                op010_accept = int(item["accept"])

                # Receive = Accept
                item["receive"] = op010_accept

                # Remain = 0
                item["remain"] = 0

                break
    # =================================
    # START / FINAL QTY
    # =================================

    start_qty = 0

    # Receive ของ OP แรก
    for item in step_data:

        if not item["is_material"]:

            start_qty = int(item["receive"])
            break

    # ถ้าไม่มี OP (มีแต่ Material)
    if start_qty == 0 and step_data:

        start_qty = sum(
            int(item["accept"])
            for item in step_data
            if item["is_material"]
        )

    # Final Qty = Accept ของ Step สุดท้าย
    # print("use_part_from_lot", use_part_from_lot)
    if use_part_from_lot:
        final_qty = 0
    else:
        final_qty = (
            int(step_data[-1]["accept"])
            if step_data
            else 0
        )

    for item in step_data:

        s = item["step"]

        receive = int(item["receive"])
        accept = int(item["accept"])
        reject = int(item["reject"])
    
        logs = s.logs or []

        # หา log ล่าสุด
        latest_log = max(
            (log for log in logs if log.work_date),
            key=lambda x: x.work_date,
            default=None
        )
       

        operator_str = ""
        operator_position = ""
        created_at_str = ""

        if latest_log:

            if latest_log.operator:

                operator_str = (
                    latest_log.operator.emp_op
                    or latest_log.operator.nickname
                    or ""
                )

                operator_position = (
                    latest_log.operator.position
                    or ""
                )

            created_at_str = latest_log.work_date.strftime("%m/%d/%y")

        # ==================================================
        # 🔥 SUPPLIER TEXT FROM LOGS
        # ==================================================
        supplier_blocks = []

        for log in logs:

            lines = []

            supplier_name = (log.supplier_name or "").strip()
            supplier_po = (log.supplier_po or "").strip()
            supplier_lot = (log.supplier_lot or "").strip()
            note = (log.note or "").strip()

            if supplier_name:
                lines.append(f"Supplier: {supplier_name.upper()}")

            if supplier_po:
                lines.append(f"PO: {supplier_po.upper()}")

            if supplier_lot:

                step_code = str(s.step_code or "").upper()

                if step_code.startswith("M"):
                    lines.append(f"Heat Lot: {supplier_lot.upper()}")
                else:
                    lines.append(f"Cert: {supplier_lot.upper()}")

            if note:
                lines.append(note.upper())

            # ถ้าไม่มีข้อมูลเลย ข้าม log นี้
            if not lines:
                continue

            block = "\n".join(lines)

            if block not in supplier_blocks:
                supplier_blocks.append(block)

        supplier_text = "\n\n".join(
            supplier_blocks
        )
        
        # ==================================================
        # BUILD STEP
        # ==================================================
        steps.append({

            "seq": s.seq,

            "step_code":
                s.step_code or "",

            "step_name":
                s.step_name or "",

            "step_detail":
                s.step_detail or "",

            "operator":
                operator_str,

            "operator_position": operator_position,
           
            "created_at":
                created_at_str,

            "qty_receive":
                receive,

            "qty_accept":
                accept,

            "qty_reject":
                reject,

            # 🔥 NEW
            "supplier_text":
                supplier_text,

            "remain": int(item["remain"]),
        })

       
        
    from sqlalchemy import func
    from models import CustomerShipmentItem
    lot_shipped_qty = (
        db.query(
            func.coalesce(
                func.sum(CustomerShipmentItem.qty),
                0
            )
        )
        .filter(
            CustomerShipmentItem.lot_id == lot.id
        )
        .scalar()
    )

    # ==================================================
    # HEADER
    # ==================================================
    
    return {

        "header": {

            "part_no":
                lot.part.part_no,

            "part_name":
                lot.part.name,

            "part_rev":
                (
                    lot.part_revision.rev
                    if lot.part_revision
                    else ""
                ),

            "customer":
                customer.name
                if customer else "",

            "customer_code":
                customer.code
                if customer else "",

            "lot_no":
                lot.lot_no,

            "po_no":
                po.po_number
                if po else "",

            "due_date":
                (
                    lot.lot_due_date.strftime("%m/%d/%y")
                    if lot.lot_due_date
                    else ""
                ),

            "planned_qty":
                to_int(

                    lot.planned_qty

                    if lot.planned_qty

                    else (
                        traveler.steps[0].total_accept
                        if traveler.steps
                        else 0
                    )
                ),

            "release_date":
                (
                    traveler.created_at.strftime("%m/%d/%y")
                    if traveler.created_at
                    else ""
                ),

            "material_detail":
                (
                    lot.part_revision.material

                    if (
                        lot and
                        lot.part_revision
                    )

                    else ""
                ),

            # =================================
            # REUSE API VALUES
            # =================================

            "start_qty": 0 if use_part_from_lot else start_qty,

            "final_qty": 0 if use_part_from_lot else final_qty,

            # QTY TO STOCK
            "stock_qty": 0 if use_part_from_lot else traveler_row.stock_qty,

           
            "order_qty": lot.planned_qty or 0,
            "started_at":
                (
                    lot.started_at.strftime("%m/%d/%y")
                    if lot.started_at
                    else ""
                ),
            "lot_po_duedate" : lot.lot_po_duedate ,

            "created_at" :   (
                    lot.created_at.strftime("%m/%d/%y")
                    if lot.created_at
                    else ""
                ),
            "lot_due_date" : 
            (
                    lot.lot_due_date.strftime("%m/%d/%y")
                    if lot.lot_due_date
                    else ""
                ),
            

             # QTY TO SHIP
            "lot_shipped_qty":
                op010_accept if use_part_from_lot else int(lot_shipped_qty or 0),

            "risk":  lot.risk or "",

            "lot_po_date":
                (
                    lot.lot_po_date.strftime("%m/%d/%y")
                    if lot.lot_po_date
                    else ""
                ),

            "lot_po_duedate":
                (
                    lot.lot_po_duedate.strftime("%m/%d/%y")
                    if lot.lot_po_duedate
                    else ""
                ),
            
        },

        "steps": steps
    }

def build_inspection_data_from_db(inspection: QAInspection) -> dict:
    lot = inspection.lot
    po = lot.po
    customer = po.customer if po else None

    steps = []

    for item in inspection.items:
        

        steps.append({
            "seq": item.seq,
            "op_no": item.op_no,
            "bb_no": item.bb_no,
            "dimension": item.dimension,
            "tqw": item.tqw,
            "fa": item.fa,
            "actual_value": item.actual_value,
            "result": item.result,
            "notes": item.notes,
            "employee": item.employee.name if item.employee else None,
            "qa_time_stamp": item.qa_time_stamp,
        })

    return {
        "lot": {
            "lot_no": lot.lot_no,
            "po_no": po.po_number if po else "",
            "customer": customer.name if customer else "",
            "part_no": lot.part.part_no,
            "part_rev": lot.part_revision.rev if lot.part_revision else "",
        },
        "inspection": {
            "id": inspection.id,
            "date": inspection.inspection_date,
            "status": inspection.status,
            "remarks": inspection.remarks,
        },
        "items": steps
    }

def to_int(v):
    try:
        return int(v)
    except (TypeError, ValueError):
        return 0
from services.traveler_docx import generate_traveler_from_db, generate_traveler_from_db_blank, generate_inspection_from_db, generate_inspection_from_db_blank


from tempfile import TemporaryDirectory
from pathlib import Path
import logging

from pathlib import Path
from tempfile import NamedTemporaryFile
from fastapi.responses import FileResponse

from sqlalchemy.orm import joinedload

@router.post("/export_traveletdoc/{traveler_id}")
def export_traveletdoc(traveler_id: int, db: Session = Depends(get_db)):

    traveler = (
        db.query(ShopTraveler)
        .options(
            joinedload(ShopTraveler.lot)
                .joinedload(ProductionLot.part),

            joinedload(ShopTraveler.lot)
                .joinedload(ProductionLot.part_revision),

            joinedload(ShopTraveler.lot)
                .joinedload(ProductionLot.po)
                .joinedload(PO.customer),

            joinedload(ShopTraveler.steps)
                .joinedload(ShopTravelerStep.logs)
        )
        .filter(ShopTraveler.id == traveler_id)
        .first()
    )

    if not traveler:
        raise HTTPException(404, "Traveler not found")
  
    # 🔥 1. build data
    data = build_traveler_data_from_db(traveler,db)


    
    # 🔥 2. template path
    BASE_DIR = Path(__file__).resolve().parents[2]
    template_path = BASE_DIR / "templates" / "shop_templete.docx"

    # 🔥 3. temp output file
    tmp = NamedTemporaryFile(suffix=".docx", delete=False)
    tmp_path = Path(tmp.name)
    tmp.close()

    # 🔥 4. generate docx
    generate_traveler_from_db(
        template_path=template_path,
        data=data,
        output_path=tmp_path
    )

    print("Generated file:", tmp_path)

    # 🔥 5. return file download
    return FileResponse(
        tmp_path,
        filename=f"traveler_{data['header']['lot_no']}.docx",
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    )



@router.post("/export_traveler_blank/{traveler_id}")
def export_traveler_blank(traveler_id: int, db: Session = Depends(get_db)):

    traveler = (
        db.query(ShopTraveler)
        .options(
            joinedload(ShopTraveler.lot)
                .joinedload(ProductionLot.part),

            joinedload(ShopTraveler.lot)
                .joinedload(ProductionLot.part_revision),

            joinedload(ShopTraveler.lot)
                .joinedload(ProductionLot.po)
                .joinedload(PO.customer),

            joinedload(ShopTraveler.steps)
                .joinedload(ShopTravelerStep.logs)
        )
        .filter(ShopTraveler.id == traveler_id)
        .first()
    )

    if not traveler:
        raise HTTPException(404, "Traveler not found")

    # 🔥 1. build data
    data = build_traveler_data_from_db(traveler,db)

    # print("Built traveler data:", data)

    # 🔥 2. template path
    BASE_DIR = Path(__file__).resolve().parents[2]
    template_path = BASE_DIR / "templates" / "shop_templete.docx"

    # 🔥 3. temp output file
    tmp = NamedTemporaryFile(suffix=".docx", delete=False)
    tmp_path = Path(tmp.name)
    tmp.close()

    # 🔥 4. generate docx
    generate_traveler_from_db_blank(
        template_path=template_path,
        data=data,
        output_path=tmp_path
    )

    

    print("Generated file:", tmp_path)

    # 🔥 5. return file download
    return FileResponse(
        tmp_path,
        filename=f"traveler_{data['header']['lot_no']}.docx",
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    )



from fastapi.responses import FileResponse
from sqlalchemy.orm import joinedload
from tempfile import NamedTemporaryFile
from pathlib import Path
import csv

@router.post("/export_inspection/{inspection_id}")
def export_inspection(inspection_id: int, db: Session = Depends(get_db)):

    print(f"Exporting inspection {inspection_id}")

    # ✅ find inspection by traveler → lot → inspection
    inspection = (
        db.query(QAInspection)
        .join(ProductionLot, QAInspection.lot_id == ProductionLot.id)
        .options(joinedload(QAInspection.items))
        .filter(QAInspection.id == inspection_id)
        .first()
    )
    
    # print(f"Queried inspection: {inspection}")
    if not inspection:
        raise HTTPException(404, "Inspection not found")
    
    # print(f"Found inspection {inspection.id} for lot {inspection.lot.lot_no}")
    # 🔥 1. build data
    data = build_inspection_data_from_db(inspection)

    # print("Built inspection data:", data)

    # # 🔥 2. template path
    BASE_DIR = Path(__file__).resolve().parents[2]
    template_path = BASE_DIR / "templates" / "inspection_template.docx"

    # # 🔥 3. temp output file
    tmp = NamedTemporaryFile(suffix=".docx", delete=False)
    tmp_path = Path(tmp.name)
    tmp.close()

    # # 🔥 4. generate docx
    generate_inspection_from_db(
        template_path=template_path,
        data=data,
        output_path=tmp_path
    )

    from fastapi.responses import FileResponse

    return FileResponse(
        path=str(tmp_path),
        filename=f"inspection_{inspection_id}.docx",
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    )

   
@router.post("/export_inspection_blank/{inspection_id}")
def export_inspection_blank(inspection_id: int, db: Session = Depends(get_db)):

    # print(f"Exporting inspection {inspection_id}")

    # ✅ find inspection by traveler → lot → inspection
    inspection = (
        db.query(QAInspection)
        .join(ProductionLot, QAInspection.lot_id == ProductionLot.id)
        .options(joinedload(QAInspection.items))
        .filter(QAInspection.id == inspection_id)
        .first()
    )
    
    # print(f"Queried inspection: {inspection}")
    if not inspection:
        raise HTTPException(404, "Inspection not found")
    
    # print(f"Found inspection {inspection.id} for lot {inspection.lot.lot_no}")
    # 🔥 1. build data
    data = build_inspection_data_from_db(inspection)

    # print("Built inspection data:", data)

    # # 🔥 2. template path
    BASE_DIR = Path(__file__).resolve().parents[2]
    template_path = BASE_DIR / "templates" / "inspection_template.docx"

    # # 🔥 3. temp output file
    tmp = NamedTemporaryFile(suffix=".docx", delete=False)
    tmp_path = Path(tmp.name)
    tmp.close()

    # # 🔥 4. generate docx
    generate_inspection_from_db_blank(
        template_path=template_path,
        data=data,
        output_path=tmp_path
    )

    from fastapi.responses import FileResponse

    return FileResponse(
        path=str(tmp_path),
        filename=f"inspection_{inspection_id}.docx",
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    )
