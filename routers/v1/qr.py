from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
import qrcode
from io import BytesIO

router = APIRouter(prefix="/qr", tags=["qr"])

@router.get("/traveler/{lot_no}")
def generate_traveler_qr(traveler_no: str):
    if not traveler_no:
        raise HTTPException(400, "Traveler number required")

    
    qr_link = f"{traveler_no}"

    qr = qrcode.make(qr_link)
    buf = BytesIO()
    qr.save(buf, format="PNG")
    buf.seek(0)

    return StreamingResponse(
        buf,
        media_type="image/png",
        headers={
            "Content-Disposition": f'inline; filename="{traveler_no}.png"'
        }
    )
