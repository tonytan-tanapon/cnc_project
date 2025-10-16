#!/usr/bin/env python3
"""
Import material purchase data from CSV into PostgreSQL.

Expected CSV columns:
Date, Part no., Vendor PO, On time/Quality, Cutting Receiving/HT, Material Cert,
PO#, Qty, Company, Type, Spec., Heat lot, Size, Length, Weight, Price, Cut Charge, Total
"""

from __future__ import annotations
import csv
from decimal import Decimal
from datetime import datetime, date
from pathlib import Path
from sqlalchemy import create_engine, select, and_
from sqlalchemy.orm import Session, sessionmaker
import sys, os

# --- project imports ---
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from models import Supplier, RawMaterial, MaterialPO, MaterialPOLine, RawBatch

# ------------------ CONFIG ------------------
DATABASE_URL = "postgresql+psycopg2://postgres:1234@localhost:5432/mydb"
CSV_FILE = Path(r"C:\Users\TPSERVER\dev\cnc_project\database_import\import_material.csv")
CSV_ENCODING = "utf-8-sig"
CSV_DELIMITER = ","

engine = create_engine(DATABASE_URL, future=True)
SessionLocal = sessionmaker(bind=engine, class_=Session, autoflush=False, autocommit=False, future=True)


# ------------------ HELPERS ------------------
def parse_date(s: str | None) -> date | None:
    if not s:
        return None
    for fmt in ("%Y-%m-%d", "%m/%d/%Y", "%d/%m/%Y"):
        try:
            return datetime.strptime(s.strip(), fmt).date()
        except Exception:
            continue
    return None


def parse_decimal(s: str | None) -> Decimal | None:
    if not s:
        return None
    try:
        return Decimal(str(s).replace(",", "").replace("$", "").strip())
    except Exception:
        return None


def normalize(s: str | None) -> str | None:
    if not s:
        return None
    return " ".join(str(s).strip().split())


# ======== DB helpers =========
def get_or_create_supplier(db: Session, name: str) -> Supplier:
    code = (name or "").strip().upper()
    supplier = db.scalar(select(Supplier).where(Supplier.code == code))
    if supplier:
        return supplier
    supplier = Supplier(code=code, name=name or code, is_material_supplier=True)
    db.add(supplier)
    db.flush()
    return supplier


def get_or_create_raw_material(db: Session, part_no: str, type_: str, spec: str, size: str, length: str) -> RawMaterial:
    code = (part_no or f"{type_}-{spec}" or "UNKNOWN").strip().upper()
    rm = db.scalar(select(RawMaterial).where(RawMaterial.code == code))
    if not rm:
        rm = RawMaterial(code=code, name=part_no or code, type=type_, spec=spec)
        db.add(rm)
        db.flush()
    # optional updates
    # if size:
    #     try:
    #         rm.size = size
    #     except Exception:
    #         pass
    # if length:
    #     try:
    #         rm.length = Decimal(length)
    #     except Exception:
    #         pass
    rm.size_text = size.strip()
    db.flush()
    return rm


def get_or_create_material_po(db: Session, supplier: Supplier, mat_po_no: str, order_date: date) -> MaterialPO:
    mpo = db.scalar(select(MaterialPO).where(MaterialPO.mat_po_no == mat_po_no))
    if mpo:
        return mpo
    mpo = MaterialPO(
        mat_po_no=mat_po_no,
        supplier_id=supplier.id,
        order_date=order_date or date.today(),
        status="open",
    )
    db.add(mpo)
    db.flush()
    return mpo


def get_or_create_po_line(db: Session, mpo: MaterialPO, rm: RawMaterial, qty: Decimal | None) -> MaterialPOLine:
    line = db.scalar(
        select(MaterialPOLine).where(
            and_(MaterialPOLine.po_id == mpo.id, MaterialPOLine.material_id == rm.id)
        )
    )
    if not line:
        line = MaterialPOLine(
            po_id=mpo.id,
            material_id=rm.id,
            qty_ordered=qty or Decimal(0),
        )
        db.add(line)
        db.flush()
    else:
        if qty and line.qty_ordered != qty:
            line.qty_ordered = qty
            db.flush()
    return line


def get_or_create_batch(
    db: Session,
    rm: RawMaterial,
    mpo: MaterialPO,
    line: MaterialPOLine,
    heat_no: str,
    cert: str,
    size: str,
    length: str,
    weight: Decimal | None,
    received_at: date,
) -> RawBatch:
    batch_no = heat_no or f"HT-{rm.id}-{mpo.id}"
    rb = db.scalar(
        select(RawBatch).where(
            and_(RawBatch.material_id == rm.id, RawBatch.batch_no == batch_no)
        )
    )
    if not rb:
        rb = RawBatch(
            material_id=rm.id,
            po_id=mpo.id,
            material_po_line_id=line.id,
            batch_no=batch_no,
            mill_heat_no=heat_no,
            cert_file=cert,
            size=size,
            length=parse_decimal(length),
            weight=weight,
            received_at=received_at,
            qty_received=weight or Decimal(0),
        )
        db.add(rb)
        db.flush()
    else:
        # update cert, weight, etc.
        updated = False
        if cert and rb.cert_file != cert:
            rb.cert_file = cert
            updated = True
        if weight and rb.weight != weight:
            rb.weight = weight
            updated = True
        if updated:
            db.flush()
    return rb


# ------------------ MAIN ------------------
def main():
    with SessionLocal() as db:
        with open(CSV_FILE, "r", encoding=CSV_ENCODING, newline="") as f:
            reader = csv.DictReader(f, delimiter=CSV_DELIMITER)
            processed = 0
            for row in reader:
                # --- Parse and normalize ---
                order_date = parse_date(row.get("Date"))
                part_no = normalize(row.get("Part no."))
                vendor_po = normalize(row.get("Vendor PO"))
                company = normalize(row.get("Company"))
                type_ = normalize(row.get("Type"))
                spec = normalize(row.get("Spec.") or row.get("Spec"))
                heat_no = normalize(row.get("Heat lot"))
                cert = normalize(row.get("Material Cert"))
                size = normalize(row.get("Size"))
                length = normalize(row.get("Length"))
                weight = parse_decimal(row.get("Weight"))
                qty = parse_decimal(row.get("Qty"))

                if not company or not vendor_po:
                    continue

                supplier = get_or_create_supplier(db, company)

                mat_no = part_no
                if type and spec:
                    mat_no = type_ +"."+ spec
                elif type:
                    mat_no = type_
                elif spec:
                    mat_no = spec
                else:
                    mat_no += ".unknow"
                    

                rm = get_or_create_raw_material(db, mat_no, type_, spec, size, length)
                mpo = get_or_create_material_po(db, supplier, vendor_po, order_date)
                line = get_or_create_po_line(db, mpo, rm, qty)
                get_or_create_batch(
                    db, rm, mpo, line, heat_no, cert, size, length, weight, order_date
                )

                processed += 1
                if processed % 50 == 0:
                    db.commit()
                    print(f"✅ Processed {processed} rows...")

            db.commit()
            print(f"🎉 Import complete: {processed} rows processed.")


if __name__ == "__main__":
    main()
