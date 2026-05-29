
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
    ICAR,
    ProductionLot
)

# ======================================
# DATABASE
# ======================================

DATABASE_URL = (
    "postgresql+psycopg2://postgres:1234"
    "@100.88.56.126:5432/mydb"
)

engine = create_engine(DATABASE_URL)

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine
)

db = SessionLocal()

# ======================================
# EXCEL
# ======================================

EXCEL_FILE = r"Z:\Topnotch Group\Public\AS9100\Corrective Action & Preventive Action\ICAR Internal Corrective Action\ICAR Activity Report.xlsx"

df = pd.read_excel(
    EXCEL_FILE,
    sheet_name="ICAR"
)


def to_float(v):

    if pd.isna(v):
        return 0

    s = str(v).strip()

    if s in (
        "",
        "-",
        "N/A",
        "NA"
    ):
        return 0

    try:
        return float(s)
    except:
        return 0
# ======================================
# COLUMN CHECK
# ======================================

print(df.columns.tolist())

# ======================================
# REMOVE EMPTY ICAR
# ======================================

df = df[
    df["ICAR No."].notna()
]

# ======================================
# IMPORT
# ======================================

count = 0

for _, r in df.iterrows():

    try:

        # ==========================
        # LOT NO
        # ==========================

        lot_no = None

        if pd.notna(
            r["NCR#/RMA#/JOB#"]
        ):
            lot_no = str(
                r["NCR#/RMA#/JOB#"]
            ).strip()

        # ==========================
        # FIND LOT
        # ==========================

        lot = None

        if lot_no:

            lot = (
                db.query(
                    ProductionLot
                )
                .filter(
                    ProductionLot.lot_no
                    == lot_no
                )
                .first()
            )

        # ==========================
        # ICAR
        # ==========================

        # ==========================
        # ICAR NO
        # ==========================

        icar_no = None

        if pd.notna(
            r["ICAR No."]
        ):

            base_icar_no = str(
                int(
                    float(
                        r["ICAR No."]
                    )
                )
            )

            dr_no = None

            if pd.notna(
                r["DR#"]
            ):

                dr_no = str(
                    r["DR#"]
                ).strip()

            if dr_no:

                icar_no = (
                    f"{base_icar_no}_{dr_no}"
                )

            else:

                icar_no = base_icar_no

        icar = ICAR(

            issue_date=
                r["Date"]
                if pd.notna(r["Date"])
                else None,

            icar_no=icar_no,

            customer_code=
                str(r["Customer"]).strip()
                if pd.notna(r["Customer"])
                else None,

            po_no=
                str(r["P.O. No."]).strip()
                if pd.notna(r["P.O. No."])
                else None,

            lot_no=lot_no,

            part_no=
                str(r["Part No."]).strip()
                if pd.notna(r["Part No."])
                else None,

            part_name=
                str(r["Description"]).strip()
                if pd.notna(r["Description"])
                else None,

            rev=
                str(r["Rev."]).strip()
                if pd.notna(r["Rev."])
                else None,

            lot_qty=
                to_float(
                    r["LOT QTY"]
                ),

            defect_qty=
                to_float(
                    r["DEFECT QTY"]
                ),

            defect_percent=
                to_float(
                    r["% DEFECT"]
                ),

            operator_name=
                str(r["Operator"]).strip()
                if pd.notna(r["Operator"])
                else None,

            remark=
                str(r["Remark"]).strip()
                if pd.notna(r["Remark"])
                else None,

            status="closed"
        )
        # ==========================
        # LINK LOT
        # ==========================

        if lot:

            icar.lot_id = lot.id

            icar.part_id = lot.part_id

            icar.part_revision_id = (
                lot.part_revision_id
            )

            icar.po_id = lot.po_id

        # ==========================
        # DUPLICATE CHECK
        # ==========================

        dup = (
            db.query(ICAR)
            .filter(
                ICAR.icar_no
                == icar.icar_no
            )
            .first()
        )

        if dup:

            print(
                f"Skip duplicate : "
                f"{icar.icar_no}"
            )

            continue

        db.add(icar)

        count += 1

    except Exception as ex:

        print(
            "ERROR :",
            ex
        )

db.commit()

print(
    f"Imported {count} records"
)

db.close()
