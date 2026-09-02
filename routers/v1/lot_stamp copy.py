from pathlib import Path
from io import BytesIO

import fitz

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from database import get_db
from models import ProductionLot

from sqlalchemy import text


import fitz
import subprocess
import tempfile
import os

from io import BytesIO
from fastapi import HTTPException, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import text

router = APIRouter(
    prefix="/lot_stamp",
    tags=["Lot Stamp"],
)

# =====================================================
# Customer Folder Mapping
# =====================================================

CUSTOMER_FOLDERS = {
    "BE5503": "BEI",
    "SA8884": "Skurka all drawing are restrict for export controlled cannot send via email",
    "AF6182": "Aero Fluid",
    "AA4519": "Atomic",
    "AT9110": "Ametek",
}

def normalize_pdf_with_ghostscript(pdf_bytes: bytes) -> bytes:

    with tempfile.TemporaryDirectory() as temp_dir:

        input_path = os.path.join(temp_dir, "input.pdf")
        output_path = os.path.join(temp_dir, "output.pdf")

        # Save temporary input
        with open(input_path, "wb") as f:
            f.write(pdf_bytes)

        # ปรับ path ให้ตรงกับเครื่อง
        gs_path = r"C:\Program Files\gs\gs10.06.0\bin\gswin64c.exe"

        command = [
            gs_path,

            "-sDEVICE=pdfwrite",

            # รักษาคุณภาพ
            "-dPDFSETTINGS=/prepress",

            # PDF compatibility
            "-dCompatibilityLevel=1.4",

            "-dNOPAUSE",
            "-dQUIET",
            "-dBATCH",

            # Font
            "-dEmbedAllFonts=true",
            "-dSubsetFonts=true",

            # Output
            f"-sOutputFile={output_path}",

            input_path,
        ]

        result = subprocess.run(
            command,
            capture_output=True,
            text=True,
        )

        if result.returncode != 0:
            print("Ghostscript error:")
            print(result.stderr)

            raise RuntimeError(
                "Ghostscript PDF normalization failed"
            )

        with open(output_path, "rb") as f:
            return f.read()
# =====================================================
# Find Drawing PDF
# =====================================================

def find_template_pdf(cus_code: str, part_no: str, rev: str):

    folder_name = CUSTOMER_FOLDERS.get(cus_code)

    if not folder_name:
        return None

    search_paths = [
        Path(fr"Z:\Public\Blue Print\{folder_name}\Ballooned Drawing"),
        Path(fr"Z:\Topnotch Group\Public\Blue Print\{folder_name}\Ballooned Drawing"),
    ]

    pattern = f"{part_no}*{rev}*.pdf" if rev else f"{part_no}*.pdf"

    for folder in search_paths:

        if not folder.exists():
            continue

        pdfs = sorted(folder.glob(pattern))

        if pdfs:
            return pdfs[0]

    return None


# =====================================================
# Page Info
# =====================================================

def get_page_info(page):

    rect = page.rect

    return {
        "width": rect.width,
        "height": rect.height,
        "rotation": page.rotation,
        "landscape": rect.width > rect.height,
    }


@router.get("/{lot_id}")
def generate_stamp(
    lot_id: int,
    db: Session = Depends(get_db),
    header_detail: bool = True,
):

    print("start generate_stamp for lot_id:", lot_id)

    # =========================================================
    # GET LOT
    # =========================================================

    lot = (
        db.query(ProductionLot)
        .filter(ProductionLot.id == lot_id)
        .first()
    )

    if not lot:
        raise HTTPException(404, "Lot not found")

    # =========================================================
    # SHIPPED QTY
    # =========================================================

    row = db.execute(
        text("""
            SELECT lot_shipped_qty
            FROM v_lot_shipment_status
            WHERE lot_id = :lot_id
        """),
        {"lot_id": lot_id}
    ).mappings().first()

    lot_shipped_qty = 0

    if row:
        lot_shipped_qty = int(
            row["lot_shipped_qty"] or 0
        )

    # =========================================================
    # VALIDATE
    # =========================================================

    if not lot.po:
        raise HTTPException(
            400,
            "Lot has no PO."
        )

    if not lot.po.customer:
        raise HTTPException(
            400,
            "PO has no customer."
        )

    if not lot.part:
        raise HTTPException(
            400,
            "Lot has no Part."
        )

    # =========================================================
    # DRAWING INFO
    # =========================================================

    part_no = lot.part.part_no

    rev = ""

    if lot.part_revision:
        rev = lot.part_revision.rev or ""

    cus_code = lot.po.customer.code

    # =========================================================
    # FIND TEMPLATE
    # =========================================================

    template = find_template_pdf(
        cus_code,
        part_no,
        rev,
    )

    if template is None:
        raise HTTPException(
            404,
            f"Drawing not found ({part_no} {rev})"
        )

    # =========================================================
    # OPEN ORIGINAL PDF
    # =========================================================

    doc = fitz.open(str(template))

    if len(doc) == 0:
        doc.close()

        raise HTTPException(
            400,
            "PDF has no pages."
        )

    page = doc[0]

    # =========================================================
    # HEADER
    # =========================================================

    if header_detail:

        due = ""

        if lot.lot_po_duedate:
            due = lot.lot_po_duedate.strftime(
                "%m/%d/%Y"
            )

        header_text = (
            f"LOT: {lot.lot_no}, "
            f"PO: {lot.po.po_number}, "
            f"QTY: {lot_shipped_qty} pcs, "
            f"DUE: {due}"
        )

        page.insert_text(
            fitz.Point(10, 20),
            header_text,
            fontsize=12,
            fontname="helv",
            overlay=True,
        )

    # =========================================================
    # PYMuPDF OUTPUT
    # =========================================================

    pdf_bytes = doc.tobytes(
        garbage=4,
        deflate=True,
    )

    doc.close()

    # =========================================================
    # IMPORTANT
    #
    # Rewrite PDF using Ghostscript
    # คล้าย Print -> PDF
    # =========================================================

    try:

        pdf_bytes = normalize_pdf_with_ghostscript(
            pdf_bytes
        )

    except Exception as e:

        print(
            "Ghostscript failed:",
            e
        )

        raise HTTPException(
            500,
            "Could not normalize drawing PDF."
        )

    # =========================================================
    # RETURN
    # =========================================================

    return StreamingResponse(
        BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={
            "Content-Disposition":
                f'attachment; filename="{lot.lot_no}_stamp.pdf"'
        },
    )