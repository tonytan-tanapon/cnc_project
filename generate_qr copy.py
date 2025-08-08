import qrcode
from PIL import Image, ImageDraw, ImageFont

def generate_qr_with_product_url(product_id):
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

    # ✅ ใช้ textbbox แทน textsize
    bbox = draw.textbbox((0, 0), product_id, font=font)
    text_width = bbox[2] - bbox[0]
    text_height = bbox[3] - bbox[1]
    text_x = (qr_width - text_width) // 2
    text_y = qr_height + 10

    draw.text((text_x, text_y), product_id, fill="black", font=font)

    new_img.save(f"{product_id}_qr.png")
    print(f"✅ สร้าง QR สำหรับ {product_id} แล้ว → {product_id}_qr.png")




# 🔁 ตัวอย่างสร้างหลาย QR
product_ids = ["P001", "P002", "P003"]
for pid in product_ids:
    generate_qr_with_product_url(pid)
