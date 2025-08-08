from sqlalchemy.orm import Session
from models import User

def create_user(db: Session, name: str, email: str):
    user = User(name=name, email=email)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user

def get_users(db: Session):
    return db.query(User).all()

import os
from fastapi import HTTPException
from sqlalchemy.orm import Session
from models import Product

QR_FOLDER = "static/qrcodes"

def delete_product_and_qr(product_id: int, db: Session):
    product = db.query(Product).filter(Product.product_id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    # ลบ QR code ถ้ามี
    qr_filename = f"{product.product_id}_qr.png"
    qr_path = os.path.join(QR_FOLDER, qr_filename)
    if os.path.exists(qr_path):
        os.remove(qr_path)
        print(f"🗑️ ลบไฟล์: {qr_path}")

    # ลบจาก database
    db.delete(product)
    db.commit()
    return {"message": "Product and QR code deleted"}
