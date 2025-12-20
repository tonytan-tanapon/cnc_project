# import fitz  # PyMuPDF
# from pathlib import Path

# def pdf_to_png(pdf_path: str, out_dir: str = "out_png", dpi: int = 300):
#     pdf_path = Path(pdf_path)
#     out_dir = Path(out_dir)
#     out_dir.mkdir(parents=True, exist_ok=True)

#     doc = fitz.open(pdf_path)
#     zoom = dpi / 72  # PDF base is 72 DPI
#     mat = fitz.Matrix(zoom, zoom)

#     for i in range(len(doc)):
#         page = doc[i]
#         pix = page.get_pixmap(matrix=mat, alpha=False)  # alpha=True ถ้าอยากได้พื้นหลังโปร่งใส (มักไม่จำเป็น)
#         out_file = out_dir / f"{pdf_path.stem}_p{i+1}.png"
#         pix.save(out_file.as_posix())
#         print("Saved:", out_file)

#     doc.close()

# if __name__ == "__main__":
#     pdf_to_png("C:\\Users\\Tanapon\\Downloads\\input.pdf", out_dir="out_png", dpi=1000)

import fitz
from PIL import Image
from pathlib import Path

def pdf_to_png_signature_sharp(
    pdf_path,
    out_dir="out_png",
    dpi=800,
    threshold=160,   # ปรับได้ 160–200
):
    pdf_path = Path(pdf_path)
    out_dir = Path(out_dir)
    out_dir.mkdir(exist_ok=True)

    doc = fitz.open(pdf_path)
    zoom = dpi / 72
    mat = fitz.Matrix(zoom, zoom)

    for i, page in enumerate(doc, start=1):
        pix = page.get_pixmap(matrix=mat, alpha=False)

        # PyMuPDF → PIL
        img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)

        # 🔑 แปลงเป็นขาวดำ (ตัด anti-alias)
        img = img.convert("L").point(
            lambda x: 0 if x < threshold else 255,
            mode="1"
        )

        out = out_dir / f"{pdf_path.stem}_p{i}_clean.png"
        img.save(out)
        print("Saved:", out)

    doc.close()



pdf_to_png_signature_sharp("C:\\Users\\Tanapon\\Downloads\\input.pdf", out_dir="out_png", dpi=600)
