import os
import sys
from datetime import datetime

import pandas as pd
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from models import ProductionLot

# ==============================
# CONFIG
# ==============================
DATABASE_URL = os.getenv("DATABASE_URL") or "postgresql+psycopg2://postgres:1234@100.88.56.126:5432/mydb"

engine = create_engine(DATABASE_URL, echo=False)
SessionLocal = sessionmaker(bind=engine)

# ==============================
# LOAD LOTS FROM FOLDERS
# ==============================
folder_paths = [
    r"Z:\Topnotch Group\Public\2024\C of C 2024",
    r"Z:\Topnotch Group\Public\2025\C of C 2025",
    r"Z:\Topnotch Group\Public\2026\C of C 2026",
]

lot_list = []

for folder_path in folder_paths:
    print("\n====================")
    print(f"📅 Processing YEAR folder: {folder_path}")

    if not os.path.exists(folder_path):
        print(f"❌ Year folder not found: {folder_path}")
        continue

    customer_list = []

    # ดึงเฉพาะ customer folders
    for file_name in os.listdir(folder_path):
        file_path = os.path.join(folder_path, file_name)
        if os.path.isdir(file_path):
            customer_list.append(file_name)

    customer_list = list(set(customer_list))

    for cus in customer_list:
        actual_folder_path = os.path.join(folder_path, cus, "Job completed")

        if not os.path.exists(actual_folder_path):
            print(f"❌ Missing folder: {actual_folder_path}")
            continue

        print(f"\n📂 Customer: {cus}")

        try:
            for file_name in os.listdir(actual_folder_path):
                file_path = os.path.join(actual_folder_path, file_name)

                if os.path.isfile(file_path):
                    # เอาเฉพาะชื่อไฟล์ ไม่เอา extension
                    file_name_no_ext = os.path.splitext(file_name)[0]

                    # lot = คำแรกก่อน space
                    lot_no = file_name_no_ext.split(" ")[0].strip()

                    if lot_no:
                        lot_list.append({"lot": lot_no})

        except Exception as e:
            print(f"❌ Error reading {actual_folder_path}: {e}")

print(f"\n📊 Total raw lots processed: {len(lot_list)}")

# สร้าง DataFrame
df = pd.DataFrame(lot_list)

if df.empty:
    print("⚠️ No lots found from folders.")
else:
    # ลบค่าว่าง
    df["lot"] = df["lot"].astype(str).str.strip()
    df = df[df["lot"] != ""]

    # ลบ duplicate
    df = df.drop_duplicates(subset=["lot"]).reset_index(drop=True)

    print(f"📊 Total unique lots: {len(df)}")
    print("Sample data:")
    for lot in df["lot"].head(5):
        print(f"  Lot: {lot}")


# ==============================
# MAIN UPDATE FUNCTION
# ==============================
def update_lots_from_excel(df: pd.DataFrame):
    db = SessionLocal()

    updated_count = 0
    not_found_count = 0
    skipped_count = 0

    try:
        for index, row in df.iterrows():
            lot_number = str(row["lot"]).strip()

            if not lot_number or lot_number.lower() == "nan":
                print(f"⏭️ Skipped empty lot at row {index}")
                skipped_count += 1
                continue

            print(f"🔍 Checking lot: {lot_number}")

            lot = db.query(ProductionLot).filter(
                ProductionLot.lot_no == lot_number
            ).first()

            if not lot:
                print(f"⚠️ Lot not found: {lot_number}")
                not_found_count += 1
                continue

            # ถ้าต้องการข้าม lot ที่ status เป็น completed อยู่แล้ว
            if getattr(lot, "status", None) == "completed":
                print(f"⏭️ Already completed: {lot_number}")
                skipped_count += 1
                continue

            lot.status = "completed"
            updated_count += 1

            print(f"✅ Updated {lot_number} → completed")

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
# RUN
# ==============================
if __name__ == "__main__":
    if df.empty:
        print("⚠️ No data to update.")
    else:
        update_lots_from_excel(df)