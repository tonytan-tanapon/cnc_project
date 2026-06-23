import pandas as pd
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
import sys, os

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from models import (
    Inventory,
    ProductionLot,
)



DATABASE_URL = "postgresql+psycopg2://postgres:1234@100.88.56.126:5432/mydb"

engine = create_engine(DATABASE_URL, echo=False)
SessionLocal = sessionmaker(bind=engine)


# -------------------------
# helpers
# -------------------------
def upsert_inventory(db, row):

    lot_no = str(row["Lot #"]).strip()

    lot = (
        db.query(ProductionLot)
        .filter(ProductionLot.lot_no == lot_no)
        .first()
    )

    if not lot:
        print(f"Lot not found: {lot_no}")
        return

    inventory = Inventory(
        lot_id=lot.id,
        prod_qty=int(row["Pro QTY"] or 0),
        ship_qty=int(row["Shipused"] or 0),
        stock_qty=int(row["remain"] or 0),
    )

    db.add(inventory)


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
    # print(df.columns.tolist())

    # =========================
    # 🔥 GROUP BY LOT (FIX MULTI ROW BUG)
    # =========================
    df = df.groupby("Lot #", as_index=False).agg({
        "Part No": "first",
        "Rev": "first",
        "Lot #": "first",
        "Pro QTY": "first",
        "Shipused": "first",
        "remain": "first",   # old: sum 🔥 CRITICAL

    })

    print("Rows after grouping:", len(df))

    db = SessionLocal()
    db.query(Inventory).delete()
    db.commit()

    try:
        for _, row in df.iterrows():

            lot_value = str(row.get("Lot #", "")).strip()

            if lot_value == "" or lot_value == "nan":
                continue

            upsert_inventory(db, row)

        db.commit()
        print("IMPORT COMPLETE")

    except Exception as e:
        db.rollback()
        raise e

    finally:
        db.close()


if __name__ == "__main__":
    print("Starting import...")
    import_excel(r"Z:\Topnotch Group\Public\Testing APP\excel_export\inventory_data.xlsx")




# python database_import/import_excel_to_database.py