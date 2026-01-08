from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from fastapi.responses import FileResponse
from database import get_db
from models import ShopTraveler, ProductionLot, Part, PartRevision, PO, Customer
import os
import tempfile
from datetime import datetime

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

    print(f"Building drawing batch for traveler {traveler_id}")
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
        f'set PATH1=Z:\\Public\\AS9100\\Shop Traveler\\Control Drawing for Production\\{cus_code}',
        f'set PATH2=Z:\\Topnotch Group\\Public\\AS9100\\Shop Traveler\\Control Drawing for Production\\{cus_code}',
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
    print(bat)
    filename = f"drawing_{lot_no}.bat"

    # ใช้ temp folder ของ Windows
    tmp = os.path.join(tempfile.gettempdir(), filename)

    with open(tmp, "w", encoding="utf-8") as f:
        f.write("\r\n".join(bat))

    return FileResponse(tmp, filename=filename)



@router.post("/traveletdoc/{traveler_id}")
def build_traveler_doc_batch(traveler_id: int, db: Session = Depends(get_db)):

    print(f"Building drawing batch for traveler {traveler_id}")
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
        f'set BASE1=Z:\\Public\\AS9100\\Shop Traveler\\SHOP TRAVELER\\{cus_code}',
        f'set BASE2=Z:\\Topnotch Group\\Public\\AS9100\\Shop Traveler\\SHOP TRAVELER\\{cus_code}',
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




    print(bat)
    filename = f"inspection_{lot_no}.bat"
    tmp = os.path.join(tempfile.gettempdir(), filename)

    with open(tmp, "w", encoding="utf-8") as f:
        f.write("\r\n".join(bat))

    return FileResponse(tmp, filename=filename)
    
def build_traveler_data_from_db(traveler: ShopTraveler) -> dict:
    lot = traveler.lot
    po = lot.po
    customer = po.customer if po else None

    return {
        "lot": {
            "part_no": lot.part.part_no,
            "lot_no": lot.lot_no,
            "po_no": po.po_number if po else "",
            "due_date": (
                lot.lot_due_date.strftime("%Y-%m-%d")
                if lot.lot_due_date else ""
            ),
            "planned_qty": lot.planned_qty or 0,
            "material_detail": lot.note or "",
        },
        "traveler": {
            "traveler_no": traveler.traveler_no,
            "customer_code": customer.code if customer else "",
            "status": traveler.status,
        },
        "steps": [
            {
                "seq": s.seq,
                "step_code": s.step_code or "",
                "step_type": s.station or "",   # material / process / inspect
                "step_name": s.step_name or "",
                "notes": s.step_detail or "",
                "qa_required": bool(s.qa_required),
                "qty_receive": float(s.qty_receive or 0),
                "qty_accept": float(s.qty_accept or 0),
                "qty_reject": float(s.qty_reject or 0),
                "step_note": s.step_note or "",
                "uom": s.uom or "pcs",
            }
            for s in traveler.steps
        ],
    }

from services.traveler_docx import generate_traveler_from_db


from tempfile import TemporaryDirectory
from pathlib import Path
import logging

from pathlib import Path
from tempfile import NamedTemporaryFile
from fastapi.responses import FileResponse

@router.post("/export_traveletdoc/{traveler_id}")
def export_traveletdoc(traveler_id: int, db: Session = Depends(get_db)):

    traveler = db.get(ShopTraveler, traveler_id)
    if not traveler:
        raise HTTPException(404, "Traveler not found")

    data = build_traveler_data_from_db(traveler)

    # 🔹 BASE DIR = project root
    BASE_DIR = Path(__file__).resolve().parents[2]

    # 🔹 TEMPLATE PATH (สำคัญมาก)
    template_path = BASE_DIR / "templates" / "shop_templete.docx"
    print("Template path:", template_path)

    if not template_path.exists():
        raise HTTPException(500, f"Template not found: {template_path}")

    # 🔹 Temp output file
    tmp_file = NamedTemporaryFile(suffix=".docx", delete=False)
    tmp_path = Path(tmp_file.name)
    tmp_file.close()

    # 🔹 Generate DOCX
    generate_traveler_from_db(
        template_path=template_path,
        data=data,
        output_path=tmp_path,
    )

    print("Generated file exists:", tmp_path.exists())

    return FileResponse(
        tmp_path,
        filename=f"traveler_{traveler.traveler_no}.docx",
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    )
