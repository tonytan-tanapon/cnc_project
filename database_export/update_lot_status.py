import pandas as pd
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from datetime import datetime
import os,sys


sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from models import (
    ProductionLot,
)

# ==============================
# 🔥 CONFIG
# ==============================
DATABASE_URL = os.getenv("DATABASE_URL") or "postgresql+psycopg2://postgres:1234@100.88.56.126:5432/mydb"

engine = create_engine(DATABASE_URL, echo=False)
SessionLocal = sessionmaker(bind=engine)

# ==============================
# 🔥 LOAD EXCEL
# ==============================
file_path = r"C:\Users\TPSERVER\dev\cnc_project\database_export\output\lot_report_format.xlsx"
df = pd.read_excel(file_path, header=None, engine="openpyxl")

# ==============================
# 🔥 MAIN UPDATE FUNCTION
# ==============================
def update_lots_from_excel(df):

    db = SessionLocal()

    updated_count = 0
    not_found_count = 0
    skipped_count = 0

    try:
        for index, row in df.iterrows():

            # 👉 limit test rows (remove later)
            # if index > 10:
            #     print("⛔ Stop after 10 rows (test mode)")
            #     break

            # ==============================
            # 🔥 EXTRACT DATA
            # ==============================
            lot_number = row[2]          # column C
            part_number = row[4]         # column E
            real_shipped_date = row[13]  # column N (fix index!)

            print(f"\nProcessing row {index+1}: Lot# {lot_number} , Part# {part_number}, Real Shipped Date: {real_shipped_date}")
            # ==============================
            # 🔥 VALIDATION
            # ==============================
            if pd.isna(lot_number):
                skipped_count += 1
                continue
           
            
            # ==============================
            # 🔥 DETERMINE STATUS
            # ==============================
            if pd.isna(real_shipped_date):
                # pass
                new_status = "not_start"
                real_shipped_date = None
            else:
                new_status = "completed"
                print(f"Real Shipped Date: {real_shipped_date} (type: {type(real_shipped_date)})")
                # convert pandas timestamp → python datetime
                if isinstance(real_shipped_date, pd.Timestamp):
                    real_shipped_date = real_shipped_date.to_pydatetime()


            
            # ==============================
            # 🔥 QUERY LOT
            # ==============================
            lot = db.query(ProductionLot).filter(
                ProductionLot.lot_no == str(lot_number) 
            ).first()
            # print(f"Queried Lot: {lot_number} → Found: {bool(lot)}")
            if not lot:
                print(f"⚠️ Lot not found: {lot_number}")
                not_found_count += 1
                continue
            

            # ==============================
            # 🔥 UPDATE
            # ==============================
            lot.status = new_status

            # optional (only if you add this column)
            if hasattr(lot, "real_shipped_date"):
                lot.real_shipped_date = real_shipped_date

            updated_count += 1

            print(f"✅ Updated {lot_number} → {new_status}")

            if lot_number in [None, "L16858", "L16902","L16661", "L17011-1"]:
                input("⛔ Debug stop for specific lot. Press Enter to continue...")

        # ==============================
        # 🔥 COMMIT ONCE
        # ==============================
        db.commit()

        print("\n🎉 DONE")
        print(f"Updated: {updated_count}")
        print(f"Not Found: {not_found_count}")
        print(f"Skipped: {skipped_count}")

    except Exception as e:
        print(f"❌ ERROR: {e}")
        db.rollback()

    finally:
        db.close()


# ==============================
# 🔥 RUN
# ==============================
if __name__ == "__main__":
    update_lots_from_excel(df)