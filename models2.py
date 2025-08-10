from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, ForeignKey, Text,Date, DateTime, UniqueConstraint, Index
from sqlalchemy.orm import relationship, declarative_base
from datetime import datetime
from database import Base

# class User(Base):
#     __tablename__ = "users"
#     id = Column(Integer, primary_key=True, index=True)
#     name = Column(String)
#     email = Column(String, unique=True, index=True)

class Customer(Base):
    __tablename__ = "customers"
    id = Column(Integer, primary_key=True, index=True)
    code = Column(String, unique=True, index=True)
    name = Column(String)
    contact = Column(String, nullable=True)
    email = Column(String, nullable=True)
    phone = Column(String, nullable=True)
    address = Column(String, nullable=True)

    pos = relationship("PO", back_populates="customer")

class PO(Base):
    __tablename__ = "purchase_orders"
    id = Column(Integer, primary_key=True, index=True)
    po_number = Column(String, unique=True, index=True, nullable=False)
    description = Column(String, nullable=True)
    customer_id = Column(Integer, ForeignKey("customers.id"), nullable=False)

    customer = relationship("Customer", back_populates="pos")
    lots = relationship("ProductionLot", back_populates="po", cascade="all, delete-orphan")

class Employee(Base):
    __tablename__ = "employees"

    id = Column(Integer, primary_key=True, index=True)
    emp_code = Column(String, unique=True, index=True)
    name = Column(String)
    position = Column(String, nullable=True)
    department = Column(String, nullable=True)
    email = Column(String, nullable=True)
    phone = Column(String, nullable=True)
    status = Column(String, default="active")  # active / inactive


# 1) แค็ตตาล็อกวัตถุดิบ
class RawMaterial(Base):
    __tablename__ = "raw_materials"
    id = Column(Integer, primary_key=True)
    code = Column(String, unique=True, index=True, nullable=False)   # ex. AL6061-RND-20
    name = Column(String, nullable=False)                            # Aluminum 6061 Round Bar Ø20
    spec = Column(String, nullable=True)                             # AMS/ASTM/ISO spec
    uom = Column(String, default="kg")                               # หน่วยเก็บสต็อก
    remark = Column(Text, nullable=True)

    batches = relationship("RawBatch", back_populates="material")

# 2) Batch/Heat ของวัตถุดิบแต่ละครั้งที่รับเข้า
class RawBatch(Base):
    __tablename__ = "raw_batches"
    id = Column(Integer, primary_key=True)
    material_id = Column(Integer, ForeignKey("raw_materials.id"), nullable=False)
    batch_no = Column(String, index=True, nullable=False)            # heat/lot number ของโรงหลอม/ซัพพลายเออร์
    supplier = Column(String, nullable=True)
    received_at = Column(Date, nullable=True)
    qty_received = Column(Float, nullable=False, default=0.0)
    qty_used = Column(Float, nullable=False, default=0.0)            # สะสมที่ใช้ไป
    cert_file = Column(String, nullable=True)                        # path เอกสาร COC/MTC (ถ้ามี)
    location = Column(String, nullable=True)                         # ที่เก็บ

    material = relationship("RawMaterial", back_populates="batches")
    uses = relationship("LotMaterialUse", back_populates="batch")

# 3) Lot การผลิต
# class ProductionLot(Base):
#     __tablename__ = "production_lots"
#     id = Column(Integer, primary_key=True)
#     lot_no = Column(String, unique=True, index=True, nullable=False) # เช่น L16899-1
#     part_no = Column(String, nullable=True)                          # หรือทำ FK ไป parts.id ถ้ามี
#     po_id = Column(Integer, ForeignKey("purchase_orders.id"), nullable=True)
#     planned_qty = Column(Integer, nullable=False, default=0)
#     started_at = Column(DateTime, nullable=True)
#     finished_at = Column(DateTime, nullable=True)
#     status = Column(String, nullable=False, default="in_process")    # in_process/hold/shipped

#     po = relationship("PO", back_populates="lots", uselist=False)    # ถ้าจะให้ PO มีหลาย lot ให้ตั้ง one-to-many ที่ PO
#     material_uses = relationship("LotMaterialUse", back_populates="lot")

# (เพิ่ม relationship ที่ PO ถ้ายังไม่มี)
from sqlalchemy.orm import declared_attr


# 4) ตารางกลาง: ใช้วัตถุดิบจาก batch ไหน เท่าไร
class LotMaterialUse(Base):
    __tablename__ = "lot_material_use"
    id = Column(Integer, primary_key=True)
    lot_id = Column(Integer, ForeignKey("production_lots.id"), nullable=False)
    batch_id = Column(Integer, ForeignKey("raw_batches.id"), nullable=False)
    qty = Column(Float, nullable=False, default=0.0)

    lot = relationship("ProductionLot", back_populates="material_uses")  # ต้องมีคู่ที่ ProductionLot
    batch = relationship("RawBatch", back_populates="uses")


# --------------------------------------------
# อัปเดต ProductionLot ให้ผูกกับ ShopTraveler (1:1)
# --------------------------------------------
class ProductionLot(Base):
    __tablename__ = "production_lots"

    id = Column(Integer, primary_key=True)
    lot_no = Column(String, unique=True, index=True, nullable=False)
    part_no = Column(String, nullable=True)
    po_id = Column(Integer, ForeignKey("purchase_orders.id"), nullable=True)
    planned_qty = Column(Integer, nullable=False, default=0)
    started_at = Column(DateTime, nullable=True)
    finished_at = Column(DateTime, nullable=True)
    status = Column(String, nullable=False, default="in_process")

    po = relationship("PO", back_populates="lots")

    # ✅ เพิ่มอันนี้เพื่อให้ back_populates match
    material_uses = relationship("LotMaterialUse", back_populates="lot", cascade="all, delete-orphan")

    traveler = relationship(
        "ShopTraveler",
        back_populates="lot",
        uselist=False,
        cascade="all, delete-orphan"
    )


# --------------------------------------------
# ShopTraveler (หัวเอกสารเดินงานของ Lot หนึ่ง ๆ)
# --------------------------------------------
class ShopTraveler(Base):
    __tablename__ = "shop_travelers"

    id = Column(Integer, primary_key=True)
    lot_id = Column(Integer, ForeignKey("production_lots.id"), nullable=False, unique=True)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    created_by_id = Column(Integer, ForeignKey("employees.id"), nullable=True)  # ใครออกใบ
    status = Column(String, nullable=False, default="open")   # open / in_progress / completed / hold / canceled
    notes = Column(Text, nullable=True)

    # ความสัมพันธ์
    lot = relationship("ProductionLot", back_populates="traveler")
    created_by = relationship("Employee", foreign_keys=[created_by_id])
    steps = relationship(
        "ShopTravelerStep",
        back_populates="traveler",
        cascade="all, delete-orphan",
        order_by="ShopTravelerStep.seq"
    )

    __table_args__ = (
        # บังคับ 1 lot ต่อ 1 traveler (มี unique ที่คอลัมน์ lot_id อยู่แล้วด้านบน)
        Index("ix_shop_travelers_status", "status"),
    )


# --------------------------------------------
# ขั้นตอนใน Shop Traveler
# --------------------------------------------
class ShopTravelerStep(Base):
    __tablename__ = "shop_traveler_steps"

    id = Column(Integer, primary_key=True)
    traveler_id = Column(Integer, ForeignKey("shop_travelers.id"), nullable=False)

    # ลำดับและข้อมูลขั้นตอน
    seq = Column(Integer, nullable=False)               # ลำดับ (1,2,3,...)
    step_code = Column(String, nullable=True)           # เช่น CUT, MILL, DRILL
    step_name = Column(String, nullable=False)          # ชื่อขั้นตอน เช่น Cutting, Milling
    station = Column(String, nullable=True)             # สถานี/เครื่อง เช่น CNC-1

    # การทำงาน
    status = Column(String, nullable=False, default="pending")  # pending / running / passed / failed / skipped
    started_at = Column(DateTime, nullable=True)
    finished_at = Column(DateTime, nullable=True)

    # ผู้รับผิดชอบขั้นตอน
    operator_id = Column(Integer, ForeignKey("employees.id"), nullable=True)

    # QA ที่ขั้นตอนนี้ (เบื้องต้นแบบง่าย)
    qa_required = Column(Boolean, default=False, nullable=False)
    qa_result = Column(String, nullable=True)           # pass / fail / n.a.
    qa_notes = Column(Text, nullable=True)

    # ความสัมพันธ์
    traveler = relationship("ShopTraveler", back_populates="steps")
    operator = relationship("Employee", foreign_keys=[operator_id])

    __table_args__ = (
        UniqueConstraint("traveler_id", "seq", name="uq_traveler_seq"),
        Index("ix_traveler_steps_status", "status"),
        Index("ix_traveler_steps_operator", "operator_id"),
    )

######################################################
# # ตารางสินค้า
# class Product(Base):
#     __tablename__ = "products"

#     product_id = Column(Integer, primary_key=True, index=True)
#     product_name = Column(String, nullable=False)
#     product_type = Column(String, nullable=True)
#     price = Column(Float, nullable=True)
#     quantity = Column(Integer, default=0)
#     in_stock = Column(Boolean, default=True)
#     created_at = Column(DateTime, default=datetime.utcnow)

#     # ความสัมพันธ์: หนึ่งสินค้ามีหลายขั้นตอน
#     process_steps = relationship("ProcessStep", back_populates="product")



# # ตารางขั้นตอนการผลิต
# class ProcessStep(Base):
#     __tablename__ = "process_steps"

#     step_id = Column(Integer, primary_key=True, index=True)
#     product_id = Column(Integer, ForeignKey("products.product_id"), nullable=False)
#     step_name = Column(String, nullable=False)
#     step_order = Column(Integer, nullable=False)
#     status = Column(String, default="pending")  # pending, in_progress, done
#     started_at = Column(DateTime, nullable=True)
#     completed_at = Column(DateTime, nullable=True)

#     # ความสัมพันธ์กลับไปที่สินค้า
#     product = relationship("Product", back_populates="process_steps")

# # Base = declarative_base()