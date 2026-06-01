import pandas as pd

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import sys
import os

sys.path.append(
    os.path.dirname(
        os.path.dirname(
            os.path.abspath(__file__)
        )
    )
)

from models import (
    ECAR,
    ProductionLot
)

# =====================================
# DB
# =====================================

DATABASE_URL = (
    "postgresql+psycopg2://postgres:1234"
    "@100.88.56.126:5432/mydb"
)

engine = create_engine(DATABASE_URL)

SessionLocal = sessionmaker(bind=engine)

db = SessionLocal()

# =====================================
# FILE
# =====================================

FILE = ( r"Z:\Topnotch Group\Public\AS9100\Corrective Action & Preventive Action\ECAR.xlsx")

df = pd.read_excel(FILE)


print(df.columns.tolist())

# =====================================
# HELPERS
# =====================================

def to_float(v):
    if pd.isna(v):
        return 0
    try:
        return float(str(v).replace("%", "").replace(",", "").strip())
    except:
        return 0

def clean(v):
    if pd.isna(v):
        return None
    s = str(v).strip()

    if s == "":
        return None
    return s


# =====================================
# IMPORT
# =====================================

count = 0

for _, r in df.iterrows():

    try:
        reject_tag = clean(r["Tag"])
        

        if not reject_tag:
            continue

        # ==========================
        # DUPLICATE
        # ==========================

       
        ecar_no = reject_tag

        i = 1

        while (
            db.query(ECAR)
            .filter(
                ECAR.ecar_no == ecar_no
            )
            .first()
        ):
            ecar_no = f"{reject_tag}-{i}"
            i += 1

       

        # ==========================
        # LOT
        # ==========================

        lot_no = clean(
            r["LOT"]
        )

        lot = None
        if lot_no:
            lot = (
                db.query(ProductionLot)
                .filter( ProductionLot.lot_no == lot_no)
                .first()
            )

        # ==========================
        # ECAR
        # ==========================

        ecar = ECAR(
            ecar_no=ecar_no,

            date_initiated = r["Date Initiated"]
                if pd.notna(
                    r["Date Initiated"]
                )
                else None,

            close_out_date=
                r["Close-Out"]
                if pd.notna(
                    r["Close-Out"]
                )
                else None,

            status="closed",

            customer_code=
                clean(
                    r["Customer"]
                ),

            ncr_rma_job_no=
                lot_no,

            po_no=
                clean(
                    r["P.O. No."]
                ),

            part_no=
                clean(
                    r["Part No."]
                ),

            part_description=
                clean(
                    r["Description"]
                ),

            rev=
                clean(
                    r["Rev."]
                ),

            reject_tag_idr=
                reject_tag,

            car_no=
                clean(
                    r["Car#"]
                ),

            shipped_qty=
                to_float(
                    r["Shipped Qty"]
                ),

            rtv_qty=
                to_float(
                    r["RTV QTY"]
                ),

            customer_rework_qty=
                to_float(
                    r["Customer Rework QTY"]
                ),

            use_as_is_qty=
                to_float(
                    r["Use As Is QTY"]
                ),

            defect_percent=
                to_float(
                    r["%Defect"]
                ),

            scar_issue=
                clean(
                    r["SCAR Issue"]
                ),

            scar_reply=
                clean(
                    r["SCAR Reply"]
                ),

            discrepancy=
                clean(
                    r["Discrepancy"]
                ),

            remark=
                clean(
                    r["Comments"]
                )
        )
   
        # ==========================
        # LINK LOT
        # ==========================

        if lot:

            ecar.lot_id = lot.id
            ecar.part_id = lot.part_id
            ecar.part_revision_id = (
                lot.part_revision_id
            )
            ecar.po_id = lot.po_id

        db.add(ecar)

        count += 1

    except Exception as ex:

        print( "ERROR",ex       )

db.commit()

print(
    f"Imported {count} ECARs"
)

db.close()