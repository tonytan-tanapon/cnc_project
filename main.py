from fastapi import FastAPI, Depends, Form, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi import Request
from fastapi.templating import Jinja2Templates
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel

from fastapi.responses import StreamingResponse
from generate_qr import generate_qr_with_product_url  # ✅ import มาจากไฟล์ generate_qr.py

from database import SessionLocal, engine
from models import Base, Product
import crud

# ✅ สร้างตารางใน database ตาม models
Base.metadata.create_all(bind=engine)

# ✅ สร้าง FastAPI app
app = FastAPI()

# ✅ ตั้งค่า CORS สำหรับมือถือหรือ frontend อื่นเรียกใช้
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # หรือกำหนดเป็น ["http://<ip>:8080"]
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
# ✅ Dependency สำหรับเชื่อมต่อ DB
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# ✅ โมเดลรับข้อมูล QR
class QRData(BaseModel):
    data: str

app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")

@app.get("/", response_class=HTMLResponse)
def home(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})

@app.get("/products", response_class=HTMLResponse)
def list_products(request: Request, db: Session = Depends(get_db)):
    products = db.query(Product).all()
    return templates.TemplateResponse("products.html", {"request": request, "products": products})


@app.get("/product/{product_id}", response_class=HTMLResponse)
def view_product(product_id: int, request: Request, db: Session = Depends(get_db)):
    product = db.query(Product).filter(Product.product_id == product_id).first()
    if not product:
        return HTMLResponse(content="ไม่พบสินค้า", status_code=404)
    return templates.TemplateResponse("product_detail.html", {"request": request, "product": product})



@app.get("/add-product", response_class=HTMLResponse)
def add_product_form(request: Request):
    return templates.TemplateResponse("add_product.html", {"request": request})

@app.post("/add-product")
def create_product(
    product_name: str = Form(...),
    product_type: str = Form(""),
    price: float = Form(0.0),
    quantity: int = Form(0),
    db: Session = Depends(get_db)
):
    new_product = Product(
        product_name=product_name,
        product_type=product_type,
        price=price,
        quantity=quantity
    )
    db.add(new_product)
    db.commit()
    return RedirectResponse(url="/add-product", status_code=303)


# แสดงฟอร์มแก้ไขสินค้า
@app.get("/product/{product_id}/edit", response_class=HTMLResponse)
def edit_product_form(product_id: int, request: Request, db: Session = Depends(get_db)):
    product = db.query(Product).filter(Product.product_id == product_id).first()
    if not product:
        return HTMLResponse("ไม่พบสินค้า", status_code=404)
    return templates.TemplateResponse("edit_product.html", {"request": request, "product": product})

# รับข้อมูลแก้ไขสินค้า
@app.post("/product/{product_id}/edit")
def edit_product(product_id: int, request: Request, 
                 product_name: str = Form(...),
                 product_type: str = Form(...),
                 price: float = Form(...),
                 quantity: int = Form(...),
                 db: Session = Depends(get_db)):
    product = db.query(Product).filter(Product.product_id == product_id).first()
    if product:
        product.product_name = product_name
        product.product_type = product_type
        product.price = price
        product.quantity = quantity
        db.commit()
    return RedirectResponse(url=f"/product/{product_id}", status_code=303)

@app.put("/products/{product_id}")
def update_product(product_id: int, updated: dict, db: Session = Depends(get_db)):
    product = db.query(Product).filter(Product.product_id == product_id).first()
    if not product:
        return {"error": "ไม่พบสินค้า"}

    product.product_name = updated.get("product_name", product.product_name)
    product.product_type = updated.get("product_type", product.product_type)
    product.price = updated.get("price", product.price)
    product.quantity = updated.get("quantity", product.quantity)

    db.commit()
    return {"message": "อัปเดตเรียบร้อย"}


# ลบสินค้า
@app.post("/product/{product_id}/delete")
def delete_product(product_id: int, db: Session = Depends(get_db)):
    product = db.query(Product).filter(Product.product_id == product_id).first()
    if product:
        db.delete(product)
        db.commit()
    return RedirectResponse(url="/products", status_code=303)



@app.get("/generate_qr/{product_id}")
def get_qr_code(product_id: str):
    file_path = generate_qr_with_product_url(product_id)
    return FileResponse(file_path, media_type="image/png")

from crud import delete_product_and_qr

@app.delete("/products/{product_id}")
def delete_product(product_id: int, db: Session = Depends(get_db)):
    return delete_product_and_qr(product_id, db)

# # ✅ เสิร์ฟ index.html ถ้ามี (optional)
# @app.get("/")
# def serve_index():
#     return FileResponse("static/index.html")

# # ✅ Root message
# @app.get("/")
# def read_root():
#     return {"message": "🚀 FastAPI QR Scanner Ready!"}

# ✅ Endpoint รับข้อมูล QR code
@app.post("/scan")
def handle_qr(qr: QRData):
    print(f"📥 ข้อมูลที่สแกน: {qr.data}")

    if qr.data == "P001":
        return {"message": "พบสินค้า: น้ำปลา"}
    elif qr.data.startswith("USER_"):
        return {"message": f"QR ผู้ใช้: {qr.data}"}
    else:
        return {"message": f"QR ที่สแกน: {qr.data}"}
    
@app.get("/scan")
def handle_scan(data: str = Query(...)):
    print(f"📥 ข้อมูลที่สแกน: {data}")
    # ตอบกลับ
    if data == "P001":
        return {"message": "Found item: computer"}
    elif data.startswith("USER_"):
        return {"message": f"QR ผู้ใช้: {data}"}
    else:
        return {"message": f"QR ที่สแกน: {data}"}

# ✅ Endpoint เพิ่มผู้ใช้
@app.post("/users/")
def create_user(name: str, email: str, db: Session = Depends(get_db)):
    return crud.create_user(db, name, email)

# ✅ Endpoint อ่านรายชื่อผู้ใช้ทั้งหมด
@app.get("/users/")
def read_users(db: Session = Depends(get_db)):
    return crud.get_users(db)
