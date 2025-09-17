# run once: pip install pandas openpyxl sqlalchemy psycopg2-binary
import pandas as pd
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from models import (Customer, Part, PartRevision, PO, POLine,
                    ProductionLot, ShopTraveler, ShopTravelerStep,
                    CustomerShipment, CustomerShipmentItem)
from datetime import datetime

ENGINE = create_engine("postgresql+psycopg2://user:pass@host:5432/db")
Session = sessionmaker(bind=ENGINE)

def find_header_row(df):
    # หาแถวที่มีคีย์เวิร์ดสำคัญ ๆ
    keys = {"Qty All Part","PO Date","Qty PO","Shipped / Date","Part Name"}
    for i in range(min(20, len(df))):
        rowvals = set(str(x).strip() for x in df.iloc[i].tolist())
        if any(k in rowvals for k in keys):
            return i
    return 0

def load_excel(path, sheet):
    raw = pd.read_excel(path, sheet_name=sheet, header=None, engine="openpyxl")
    hdr = find_header_row(raw)
    df = pd.read_excel(path, sheet_name=sheet, header=hdr, engine="openpyxl")
    # ทำความสะอาดคอลัมน์
    df.columns = [str(c).strip() for c in df.columns]
    return df

def upsert_part(sess, part_no, part_name):
    if not part_no and not part_name:
        return None
    part = sess.query(Part).filter_by(part_no=part_no).one_or_none()
    if not part:
        part = Part(part_no=part_no or part_name, name=part_name or part_no)
        sess.add(part)
    else:
        if part_name and not part.name:
            part.name = part_name
    return part

def upsert_revision(sess, part, rev):
    if not rev or not part: return None
    pr = sess.query(PartRevision).filter_by(part_id=part.id, rev=rev).one_or_none()
    if not pr:
        pr = PartRevision(part_id=part.id, rev=rev, is_current=True)
        sess.add(pr)
    return pr

def upsert_po(sess, po_number, customer_name=None):
    if not po_number: return None
    po = sess.query(PO).filter_by(po_number=po_number).one_or_none()
    if not po:
        cust = None
        if customer_name:
            cust = sess.query(Customer).filter_by(name=customer_name).one_or_none()
            if not cust:
                cust = Customer(code=customer_name, name=customer_name)
                sess.add(cust)
                sess.flush()
        po = PO(po_number=po_number, customer_id=cust.id if cust else None)
        sess.add(po)
    return po

def parse_date(s):
    if pd.isna(s): return None
    try:
        return pd.to_datetime(s).to_pydatetime()
    except:
        return None

def import_rows(df):
    print(df.head(10))
    sess = Session()
    try:
        for _, r in df.iterrows():
            
            po_no   = str(r.get("PO Number", r.get("PO No.", ""))).strip() 
            part_no = str(r.get("Part No.", "")).strip()
            # part_nm = str(r.get("Part Name", r.get("Part Name.", ""))).strip()
            # rev     = str(r.get("Rev", "")).strip() or None
            # qty_po  = r.get("Qty PO", None)
            # due_dt  = parse_date(r.get("PO Date"))

            # if not po_no and not part_no and pd.isna(qty_po):
        #         continue  # ข้ามแถวว่าง/บรรทัดคั่น

        #     po = upsert_po(sess, po_no)
        #     part = upsert_part(sess, part_no, part_nm)
        #     sess.flush()
        #     pr = upsert_revision(sess, part, rev)
        #     sess.flush()

        #     # POLine
        #     if po and part and qty_po is not None and str(qty_po) != "nan":
        #         line = POLine(po_id=po.id, part_id=part.id,
        #                       revision_id=(pr.id if pr else None),
        #                       qty_ordered=qty_po, due_date=(due_dt.date() if due_dt else None))
        #         sess.add(line)
        #         sess.flush()

        #         # Lot (ถ้ามี)
        #         lot_no = str(r.get("Lot", "")).strip()
        #         if lot_no:
        #             lot = ProductionLot(lot_no=lot_no, po_id=po.id, po_line_id=line.id,
        #                                 part_id=part.id, part_revision_id=(pr.id if pr else None),
        #                                 planned_qty=qty_po or 0)
        #             sess.add(lot)
        #             sess.flush()

        #             # Traveler & Steps (ตัวอย่าง: สแกนคอลัมน์ “Step 1..20”)
        #             traveler = ShopTraveler(lot_id=lot.id, status="open")
        #             sess.add(traveler)
        #             sess.flush()

        #             for seq in range(1, 21):
        #                 step_name = r.get(f"Step {seq}") or r.get(seq)  # เผื่อชีทใส่ 1..20 เป็นหัวคอลัมน์
        #                 if pd.isna(step_name) or str(step_name).strip()=="":
        #                     continue
        #                 st = ShopTravelerStep(
        #                     traveler_id=traveler.id,
        #                     seq=seq,
        #                     step_name=str(step_name).strip(),
        #                     status="pending"
        #                 )
        #                 sess.add(st)

        #         # Shipment (ถ้ามี)
        #         ship_dt = parse_date(r.get("Shipped / Date"))
        #         ship_qty = r.get("Qty Shipped") or r.get("Shipped Qty")
        #         if ship_dt and ship_qty and str(ship_qty)!="nan":
        #             shp = CustomerShipment(po_id=po.id, shipped_at=ship_dt)
        #             sess.add(shp); sess.flush()
        #             item = CustomerShipmentItem(shipment_id=shp.id, po_line_id=line.id, qty=ship_qty)
        #             sess.add(item)

        # sess.commit()
    except Exception as e:
        sess.rollback()
        raise
    finally:
        sess.close()

if __name__ == "__main__":
    # เลือกโหลดทีละชีท
    dfA = load_excel("C:/Users/Tanapon/Downloads/2040364-1.xlsm", "2040364-1")
    # dfB = load_excel("C:/Users/Tanapon/Downloads/5673-22-1.xlsm", "5673-22-1")
    # print(dfA.head())
    import_rows(dfA)
    # import_rows(dfB)
# C:\Users\Tanapon\Downloads