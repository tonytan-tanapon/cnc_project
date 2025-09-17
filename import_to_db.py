# import_to_db.py
# -*- coding: utf-8 -*-
import math, re
import pandas as pd
from datetime import datetime
from sqlalchemy import create_engine, and_
from sqlalchemy.orm import sessionmaker

# === DB ===
DATABASE_URL = "postgresql+psycopg2://postgres:1234@localhost:5432/mydb"

# === โมเดลของคุณ (ต้อง import ได้) ===
from models import (
    Customer, Part, PartRevision, PO, POLine,
    ProductionLot, ShopTraveler, ShopTravelerStep,
    CustomerShipment, CustomerShipmentItem
)

# ---------------- Utils ----------------
def s(x):
    if x is None: return ""
    if isinstance(x, float) and math.isnan(x): return ""
    return str(x).strip()

def to_num(x):
    try:
        if x is None or (isinstance(x, float) and math.isnan(x)): return None
        return float(x)
    except: return None

def to_dt(x):
    if x is None: return None
    dt = pd.to_datetime(x, errors="coerce")
    if pd.isna(dt): return None
    return dt.to_pydatetime()

# -------------- Read metadata (header zone) --------------
from openpyxl import load_workbook

def find_label_value(ws, labels, max_rows=40, max_cols=60):
    labset = {str(l).strip().lower() for l in labels}
    for r in range(1, max_rows+1):
        for c in range(1, max_cols+1):
            v = ws.cell(r, c).value
            if v is None: continue
            if str(v).strip().lower() in labset:
                for cc in range(c+1, min(c+12, max_cols+1)):
                    nv = ws.cell(r, cc).value
                    if s(nv): return s(nv)
                return ""
    return ""

def read_metadata(path, sheet):
    wb = load_workbook(path, data_only=True)
    ws = wb[sheet]
    part_no   = find_label_value(ws, {"part no.", "part no"})
    part_name = find_label_value(ws, {"part name.", "part name"})
    customer  = find_label_value(ws, {"customer.", "customer"})
    rev       = find_label_value(ws, {"rev.", "rev"})

    # fallback หา pattern ลูกค้าเช่น AF6182 ถ้า label หาไม่เจอ
    if not customer:
        for r in range(1, 15):
            for c in range(1, 40):
                txt = s(ws.cell(r, c).value)
                if re.fullmatch(r"[A-Za-z]{1,3}\d{3,6}", txt):
                    customer = txt; break
            if customer: break

    return {
        "part_no": s(part_no) or None,
        "part_name": s(part_name) or None,
        "customer": s(customer) or None,
        "rev": s(rev) or None
    }

# -------------- Read table (Product Control Table) --------------
TABLE_KEYS = {"Lot Number","PO Number","PO Date","Qty PO","Shipped / Date","Qty Shipped"}

def find_header_row(path, sheet):
    raw = pd.read_excel(path, sheet_name=sheet, header=None, engine="openpyxl")
    for i in range(0, min(50, len(raw))):
        if len(TABLE_KEYS & {s(v) for v in raw.iloc[i].tolist()}) >= 3:
            return i
    return 0

def read_table(path, sheet):
    hdr = find_header_row(path, sheet)
    df  = pd.read_excel(path, sheet_name=sheet, header=hdr, engine="openpyxl")
    df.columns = [s(c) for c in df.columns]
    want = [c for c in ["Lot Number","PO Number","PO Date","Qty PO","Shipped / Date","Qty Shipped"] if c in df.columns]
    df = df[want].copy()

    for d in ["PO Date","Shipped / Date"]:
        if d in df.columns: df[d] = pd.to_datetime(df[d], errors="coerce")
    for n in ["Qty PO","Qty Shipped"]:
        if n in df.columns: df[n] = pd.to_numeric(df[n], errors="coerce")

    df = df.dropna(how="all", subset=want).reset_index(drop=True)
    return df

# ----------------- Upserts -----------------
DEFAULT_CUSTOMER = "UNSPECIFIED"

def upsert_customer(sess, name):
    name = (name or DEFAULT_CUSTOMER).strip()
    c = sess.query(Customer).filter_by(name=name).one_or_none()
    if not c:
        c = Customer(code=name, name=name)
        sess.add(c); sess.flush()
    return c

# แทรกไว้ใน import_to_db.py
PLACEHOLDER_NAMES = {"part name.", "part name", "name", "-"}

def upsert_part(sess, part_no, part_name):
    key = (part_no or part_name)
    if not key:
        return None

    p = sess.query(Part).filter_by(part_no=key).one_or_none()
    if not p:
        p = Part(part_no=key, name=(part_name or part_no))
        sess.add(p); sess.flush()
        return p

    # อนุญาตให้ "แก้ชื่อ" ถ้า:
    # - เดิมว่าง, หรือ
    # - เดิมเป็นคำ placeholder (เช่น 'Part Name.'), หรือ
    # - อยากบังคับให้ sync ชื่อใหม่ถ้าแตกต่าง (เปิดใช้บรรทัดสุดท้าย)
    new_name = (part_name or "").strip()
    if new_name:
        curr = (p.name or "").strip().lower()
        if not curr or curr in PLACEHOLDER_NAMES:
            p.name = new_name
        # ถ้าอยากอัปเดตเสมอเมื่อแตกต่าง ให้ปลดคอมเมนต์ด้านล่าง
        # elif p.name != new_name:
        #     p.name = new_name

    return p


def upsert_revision(sess, part, rev):
    if not part or not rev: return None
    pr = sess.query(PartRevision).filter_by(part_id=part.id, rev=rev).one_or_none()
    if not pr:
        pr = PartRevision(part_id=part.id, rev=rev, is_current=True)
        sess.add(pr); sess.flush()
    return pr

def upsert_po(sess, po_number, customer):
    if not po_number: return None
    if customer is None: customer = upsert_customer(sess, DEFAULT_CUSTOMER)
    po = sess.query(PO).filter_by(po_number=po_number).one_or_none()
    if not po:
        po = PO(po_number=po_number, customer_id=customer.id)
        sess.add(po); sess.flush()
    elif not po.customer_id:
        po.customer_id = customer.id
    return po

# ----------------- Import 1 sheet -----------------
def import_sheet(sess, path, sheet):
    meta = read_metadata(path, sheet)
    df   = read_table(path, sheet)

    customer = upsert_customer(sess, meta.get("customer"))
    part     = upsert_part(sess, meta.get("part_no"), meta.get("part_name"))
    rev      = upsert_revision(sess, part, meta.get("rev"))
    sess.flush()

    stats = dict(po=0, poline=0, lot=0, traveler=0, ship=0, ship_item=0)

    for _, r in df.iterrows():
        po_no      = s(r.get("PO Number"))
        lot_no     = s(r.get("Lot Number"))
        qty_po     = to_num(r.get("Qty PO"))
        po_date    = to_dt(r.get("PO Date"))
        shipped_at = to_dt(r.get("Shipped / Date"))
        qty_ship   = to_num(r.get("Qty Shipped"))

        if not po_no and not lot_no and qty_po is None and qty_ship is None:
            continue

        # PO
        po = upsert_po(sess, po_no, customer)

        # POLine (idempotent key แบบง่าย)
        line = None
        if po and part and qty_po is not None:
            line = (sess.query(POLine)
                      .filter(and_(
                          POLine.po_id == po.id,
                          POLine.part_id == part.id,
                          POLine.revision_id == (rev.id if rev else None),
                          POLine.qty_ordered == qty_po,
                          POLine.due_date == (po_date.date() if isinstance(po_date, datetime) else po_date)
                      )).one_or_none())
            if not line:
                line = POLine(
                    po_id=po.id, part_id=part.id,
                    revision_id=(rev.id if rev else None),
                    qty_ordered=qty_po,
                    due_date=(po_date.date() if isinstance(po_date, datetime) else po_date)
                )
                sess.add(line); sess.flush()
                stats["poline"] += 1

        # Lot + Traveler
        lot = None
        if lot_no and po and part:
            lot = sess.query(ProductionLot).filter_by(lot_no=lot_no).one_or_none()
            if not lot:
                lot = ProductionLot(
                    lot_no=lot_no,
                    po_id=po.id,
                    po_line_id=(line.id if line else None),
                    part_id=part.id,
                    part_revision_id=(rev.id if rev else None),
                    planned_qty=int(qty_po or 0)
                )
                sess.add(lot); sess.flush()
                stats["lot"] += 1

                trav = ShopTraveler(lot_id=lot.id, status="open")
                sess.add(trav); sess.flush()
                stats["traveler"] += 1

        # Shipment
        if po and shipped_at and qty_ship:
            shp = (sess.query(CustomerShipment)
                   .filter(and_(CustomerShipment.po_id == po.id,
                                CustomerShipment.shipped_at == shipped_at))
                   .one_or_none())
            if not shp:
                shp = CustomerShipment(po_id=po.id, shipped_at=shipped_at)
                sess.add(shp); sess.flush()
                stats["ship"] += 1

            item = (sess.query(CustomerShipmentItem)
                    .filter(and_(CustomerShipmentItem.shipment_id == shp.id,
                                 CustomerShipmentItem.po_line_id == (line.id if line else None),
                                 CustomerShipmentItem.lot_id == (lot.id if lot else None),
                                 CustomerShipmentItem.qty == qty_ship))
                    .one_or_none())
            if not item:
                item = CustomerShipmentItem(
                    shipment_id=shp.id,
                    po_line_id=(line.id if line else None),
                    lot_id=(lot.id if lot else None),
                    qty=qty_ship
                )
                sess.add(item); sess.flush()
                stats["ship_item"] += 1

    return stats, meta, df

# ----------------- Main -----------------
def run(files):
    engine = create_engine(DATABASE_URL)
    Session = sessionmaker(bind=engine)
    sess = Session()
    try:
        total = dict(po=0, poline=0, lot=0, traveler=0, ship=0, ship_item=0)
        for path, sheet in files:
            print(f"\n== Import: {path} [{sheet}] ==")
            stats, meta, df = import_sheet(sess, path, sheet)
            print("Metadata:", meta)
            print("Rows read:", len(df))
            print("Inserted:", stats)
            for k,v in stats.items(): total[k] += v
        sess.commit()
        print("\n✅ DONE. Totals:", total)
    except Exception as e:
        sess.rollback()
        print("❌ ERROR:", e)
        raise
    finally:
        sess.close()

if __name__ == "__main__":
    # แก้พาธ/ชื่อชีทให้ตรงจริง
    FILES = [
        (r"C:/Users/Tanapon/Downloads/2040364-1.xlsm", "2040364-1"),
        (r"C:/Users/Tanapon/Downloads/5673-22-1.xlsm", "5673-22-1"),
        (r"C:/Users/Tanapon/Downloads/A11384-1.xlsm", "A11384-1"),
    ]
    run(FILES)
