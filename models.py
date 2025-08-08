from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import relationship, declarative_base
from datetime import datetime
from database import Base

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String)
    email = Column(String, unique=True, index=True)

# ตารางสินค้า
class Product(Base):
    __tablename__ = "products"

    product_id = Column(Integer, primary_key=True, index=True)
    product_name = Column(String, nullable=False)
    product_type = Column(String, nullable=True)
    price = Column(Float, nullable=True)
    quantity = Column(Integer, default=0)
    in_stock = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    # ความสัมพันธ์: หนึ่งสินค้ามีหลายขั้นตอน
    process_steps = relationship("ProcessStep", back_populates="product")



# ตารางขั้นตอนการผลิต
class ProcessStep(Base):
    __tablename__ = "process_steps"

    step_id = Column(Integer, primary_key=True, index=True)
    product_id = Column(Integer, ForeignKey("products.product_id"), nullable=False)
    step_name = Column(String, nullable=False)
    step_order = Column(Integer, nullable=False)
    status = Column(String, default="pending")  # pending, in_progress, done
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)

    # ความสัมพันธ์กลับไปที่สินค้า
    product = relationship("Product", back_populates="process_steps")

Base = declarative_base()