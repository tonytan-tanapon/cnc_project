from pathlib import Path
from io import BytesIO

import fitz

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from database import get_db
from models import ProductionLot

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


# =====================================================
# API
# =====================================================

@router.get("/{lot_id}")
def generate_stamp(
    lot_id: int,
    db: Session = Depends(get_db),
):

    lot = (
        db.query(ProductionLot)
        .filter(ProductionLot.id == lot_id)
        .first()
    )

    if not lot:
        raise HTTPException(404, "Lot not found")

    row = db.execute(
        text("""
            SELECT lot_shipped_qty
            FROM v_lot_shipment_status
            WHERE lot_id = :lot_id
        """),
        {"lot_id": lot_id}
    ).mappings().first()

    lot_shipped_qty = int(row["lot_shipped_qty"] or 0)

    # -----------------------------
    # Validate relationships
    # -----------------------------

    if not lot.po:
        raise HTTPException(400, "Lot has no PO.")

    if not lot.po.customer:
        raise HTTPException(400, "PO has no customer.")

    if not lot.part:
        raise HTTPException(400, "Lot has no Part.")

    part_no = lot.part.part_no

    rev = ""
    if lot.part_revision:
        rev = lot.part_revision.rev or ""

    cus_code = lot.po.customer.code
    print("PO     :", lot.po.po_number)
    print("Customer :", cus_code)
    print("Part     :", part_no)
    print("Revision :", rev)

    # -----------------------------
    # Find PDF
    # -----------------------------

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

    print(template)

    # -----------------------------
    # Open PDF
    # -----------------------------

    doc = fitz.open(str(template))
    page = doc[0]

    info = get_page_info(page)

    print(info)

    due = ""

    if lot.lot_po_duedate:
        due = lot.lot_po_duedate.strftime("%m/%d/%Y")

    # -----------------------------
    # DEBUG
    # -----------------------------

    page.insert_htmlbox(
        fitz.Rect(
            1,
            1,
            350,
            140,
        ),
        f"""
        <div style="font-size:12pt">
           
            <b>LOT:</b> {lot.lot_no}, <b>PO:</b> {lot.po.po_number}, <b>QTY:</b> {lot_shipped_qty} pcs, <b>DUE:</b> {due}
        </div>
        """
        # f"""
        # <div style="font-size:8pt">
        #     <b>Width:</b> {info["width"]}<br>
        #     <b>Height:</b> {info["height"]}<br>
        #     <b>Rotation:</b> {info["rotation"]}<br>
        #     <b>Landscape:</b> {info["landscape"]}<br><br>

        #     <b>Customer:</b> {cus_code}<br>
        #     <b>Part:</b> {part_no}<br>
        #     <b>Rev:</b> {rev}<br><br>

        #     <b>LOT:</b> {lot.lot_no}<br>
        #     <b>QTY:</b> {lot.planned_qty}<br>
        #     <b>DUE:</b> {due}
        # </div>
        # """
    )

    pdf = doc.tobytes()

    return StreamingResponse(
        BytesIO(pdf),
        media_type="application/pdf",
        headers={
            "Content-Disposition":
            f'attachment; filename="{lot.lot_no}_stamp.pdf"'
        },
    )