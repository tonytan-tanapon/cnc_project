import pandas as pd
from sqlalchemy.orm import Session
from pathlib import Path
import sys


# ==========================================
# Add project root to Python path
# ==========================================
project_root = Path(__file__).resolve().parents[1]
sys.path.append(str(project_root))

from database import SessionLocal
import traceback
from models import ProductionLot

def update_lot_shippment():
    # ==========================================
    # Config
    # ==========================================
    EXCEL_FILE = (
        r"Z:\Topnotch Group\Public\AS9100\Shop Traveler"
        r"\Shop Traveler Scan\checklist\check_list2026.xlsx"
    )

    db: Session = SessionLocal()

    try:

        # ==========================================
        # Read Excel
        # ==========================================
        df = pd.read_excel(EXCEL_FILE)

        df.columns = df.columns.str.strip()

        # ตรวจสอบว่ามีคอลัมน์ที่ต้องใช้
        required_columns = {"Lot#", "Status"}

        if not required_columns.issubset(df.columns):
            raise Exception(
                f"Excel is missing required columns.\n"
                f"Found: {df.columns.tolist()}"
            )

        # Clean data
        df["Lot#"] = df["Lot#"].astype(str).str.strip()
        df["Status"] = df["Status"].astype(str).str.upper().str.strip()

        # Dict: {lot_no: status}
        excel_status = dict(zip(df["Lot#"], df["Status"]))

        # ==========================================
        # Query Production Lots
        # ==========================================
        lots = (
            db.query(ProductionLot)
            .filter(
                ProductionLot.status.in_(
                    ["completed", "shipped"]
                )
            )
            .all()
        )

        updated = 0

        # ==========================================
        # Sync Status
        # ==========================================
        for lot in lots:

            lot_no = str(lot.lot_no).strip()

            status = excel_status.get(lot_no)

            # ไม่มีใน Excel
            if status is None:
                continue

            # Excel = FOUND
            if status == "FOUND":

                if lot.status != "completed":
                    print(
                        f"{lot_no}: "
                        f"{lot.status} -> completed"
                    )
                    lot.status = "completed"
                    updated += 1

            # Excel = MISSING
            elif status == "MISSING":

                if lot.status != "shipped":
                    print(
                        f"{lot_no}: "
                        f"{lot.status} -> shipped"
                    )

                    lot.status = "shipped"
                    updated += 1

        # ==========================================
        # Commit
        # ==========================================
        if updated > 0:
            db.commit()

        print()
        print(f"Updated {updated} lots.")

    except Exception as e:
        db.rollback()
        print("=" * 60)
        print("update_lot_shippment FAILED")
        print(e)
        traceback.print_exc()
        print("=" * 60)

    finally:
        db.close()

# update_lot_shippment()

