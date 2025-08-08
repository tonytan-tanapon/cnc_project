import qrcode
from PIL import Image, ImageDraw, ImageFont
from io import BytesIO
import os

def generate_qr_with_product_url(product_id: str, save_path: str = "static/qrcodes") -> str:
    url = f"http://192.168.1.211:8000/track?product_id={product_id}"
    qr = qrcode.make(url).convert("RGB")

    qr_width, qr_height = qr.size
    total_height = qr_height + 40
    new_img = Image.new("RGB", (qr_width, total_height), "white")
    new_img.paste(qr, (0, 0))

    draw = ImageDraw.Draw(new_img)
    try:
        font = ImageFont.truetype("arial.ttf", 20)
    except:
        font = ImageFont.load_default()

    bbox = draw.textbbox((0, 0), product_id, font=font)
    text_width = bbox[2] - bbox[0]
    text_x = (qr_width - text_width) // 2
    text_y = qr_height + 10
    draw.text((text_x, text_y), product_id, fill="black", font=font)

    # ✅ สร้างโฟลเดอร์ถ้ายังไม่มี
    os.makedirs(save_path, exist_ok=True)

    # ✅ บันทึกไฟล์
    file_path = os.path.join(save_path, f"{product_id}_qr.png")
    new_img.save(file_path)

    print(f"✅ บันทึก QR สำหรับ {product_id} ที่: {file_path}")
    return file_path  # 🔁 ส่ง path กลับ
