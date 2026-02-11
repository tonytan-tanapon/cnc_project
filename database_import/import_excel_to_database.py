import pandas as pd
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
import sys, os

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from models import (
    Customer,
    PO,
    POLine,
    Part,
    PartRevision,
    ProductionLot,
)

DATABASE_URL = "postgresql+psycopg2://postgres:1234@100.88.56.126:5432/mydb"

engine = create_engine(DATABASE_URL, echo=False)
SessionLocal = sessionmaker(bind=engine)


# -------------------------
# helpers
# -------------------------

def get_or_create_customer(db, code):
    cust = db.query(Customer).filter(Customer.code == code).first()
    if not cust:
        cust = Customer(code=code, name=code)
        db.add(cust)
        db.flush()
    return cust


def get_or_create_part(db, part_no, description):
    part = db.query(Part).filter(Part.part_no == part_no).first()
    if not part:
        part = Part(part_no=part_no, name=description)
        db.add(part)
        db.flush()
    return part


def get_or_create_revision(db, part_id, rev):
    if not rev or rev == "nan":
        return None

    r = (
        db.query(PartRevision)
        .filter(PartRevision.part_id == part_id)
        .filter(PartRevision.rev == rev)
        .first()
    )

    if not r:
        r = PartRevision(part_id=part_id, rev=rev, is_current=True)
        db.add(r)
        db.flush()

    return r


def get_or_create_po_line(
    db,
    po_number,
    customer_id,
    part_id,
    revision_id,
    qty,
    due_date
):
    # --- PO ---
    po = db.query(PO).filter(PO.po_number == po_number).first()
    if not po:
        po = PO(po_number=po_number, customer_id=customer_id)
        db.add(po)
        db.flush()

    # --- PO LINE ---
    po_line = (
        db.query(POLine)
        .filter(POLine.po_id == po.id)
        .filter(POLine.part_id == part_id)
        .filter(POLine.revision_id == revision_id)
        .first()
    )

    if not po_line:
        po_line = POLine(
            po_id=po.id,
            part_id=part_id,
            revision_id=revision_id,
            qty_ordered=qty,
            due_date=due_date
        )
        db.add(po_line)
        db.flush()

    return po, po_line


# -------------------------
# lot importer
# -------------------------
from datetime import timedelta
from dateutil.relativedelta import relativedelta
def upsert_lot(db, row):
    lot_no = str(row["Lot#"]).strip()
    part_no = str(row["Part No."]).strip()
    po_number = str(row["PO"]).strip()
    customer_code = str(row["Name"]).strip()
    description = str(row["Description"])
    rev = str(row["Rev."])
    qty = int(row["Qty PO"])
    due_date = row["Due Date"]

    # if due_date:
    #     # subtract 1 month
    #     new_due_date = due_date - relativedelta(months=1)

    #     # Monday = 0 ... Sunday = 6
    #     if new_due_date.weekday() == 5:   # Saturday
    #         new_due_date -= timedelta(days=1)

    #     elif new_due_date.weekday() == 6: # Sunday
    #         new_due_date -= timedelta(days=2)

    # else:
    #     new_due_date = due_date

    print(f"Processing Lot {lot_no}")

    customer = get_or_create_customer(db, customer_code)
    part = get_or_create_part(db, part_no, description)
    revision = get_or_create_revision(db, part.id, rev)

    po, po_line = get_or_create_po_line(
        db,
        po_number,
        customer.id,
        part.id,
        revision.id if revision else None,
        qty,
        due_date
    )

    lot = db.query(ProductionLot).filter(
        ProductionLot.lot_no == lot_no
    ).first()

    if not lot:
        lot = ProductionLot(
            lot_no=lot_no,
            part_id=part.id,
            part_revision_id=revision.id if revision else None,
            po_id=po.id,
            po_line_id=po_line.id,
            planned_qty=qty,
            lot_due_date=due_date,
            status="not_start",
        )
        db.add(lot)
        print(f"CREATE LOT {lot_no}")
    else:
        lot.planned_qty = qty
        lot.lot_due_date = due_date
        lot.po_line_id = po_line.id
        print(f"UPDATE LOT {lot_no}")


# -------------------------
# excel loader
# -------------------------

def import_excel(file_path):

    df = pd.read_excel(
        file_path,
        sheet_name="Sheet1",
        engine="openpyxl"
    )

    df.columns = df.columns.str.strip()

    # print(df.head())
    print("Rows:", len(df))

    db = SessionLocal()

    try:
        for _, row in df.iterrows():

            lot_value = str(row.get("Lot#", "")).strip()

            if lot_value == "" or lot_value == "nan":
                continue

            upsert_lot(db, row)

        db.commit()
        print("IMPORT COMPLETE")

    except Exception as e:
        db.rollback()
        raise e

    finally:
        db.close()


if __name__ == "__main__":
    import_excel(r"Z:\Topnotch Group\Public\Data Base & Inventory Stock\update.xlsm")
