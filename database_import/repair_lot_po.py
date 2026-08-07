import pandas as pd

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from models import (
    PO,
    POLine,
    ProductionLot,
    Part,
    PartRevision,
)

DATABASE_URL = "postgresql+psycopg2://postgres:1234@localhost/mydb"

engine = create_engine(DATABASE_URL)
Session = sessionmaker(bind=engine)


def repair_from_excel(filename):

    df = pd.read_excel(filename)

    db = Session()

    try:

        for _, row in df.iterrows():

            lot_no = str(row["Lot #"]).strip()
            po_number = str(row["PO"]).strip()
            part_no = str(row["Part No."]).strip()
            rev = str(row["Rev"]).strip()

            qty = int(row["Qty"])

            lot = (
                db.query(ProductionLot)
                .filter(ProductionLot.lot_no == lot_no)
                .first()
            )

            if not lot:
                print(f"Lot not found : {lot_no}")
                continue

            #########################################
            # PO
            #########################################

            po = (
                db.query(PO)
                .filter(PO.po_number == po_number)
                .first()
            )

            if not po:
                print(f"Create PO {po_number}")

                po = PO(
                    po_number=po_number,
                    customer_id=lot.po.customer_id if lot.po else 1,
                )

                db.add(po)
                db.flush()

            #########################################
            # Part
            #########################################

            part = (
                db.query(Part)
                .filter(Part.part_no == part_no)
                .first()
            )

            if not part:
                print("Part missing", part_no)
                continue

            #########################################
            # Revision
            #########################################

            revision = (
                db.query(PartRevision)
                .filter(
                    PartRevision.part_id == part.id,
                    PartRevision.rev == rev,
                )
                .first()
            )

            #########################################
            # PO Line
            #########################################

            line = (
                db.query(POLine)
                .filter(
                    POLine.po_id == po.id,
                    POLine.part_id == part.id,
                    POLine.revision_id == (
                        revision.id if revision else None
                    ),
                )
                .first()
            )

            if not line:

                print(f"Create Line {po_number} {part_no}")

                line = POLine(
                    po_id=po.id,
                    part_id=part.id,
                    revision_id=revision.id if revision else None,
                    qty_ordered=qty,
                )

                db.add(line)
                db.flush()

            #########################################
            # MOVE LOT
            #########################################

            lot.po_id = po.id
            lot.po_line_id = line.id

            print(
                f"{lot_no} -> {po.po_number}"
            )

        db.commit()

    except Exception:

        db.rollback()
        raise

    finally:

        db.close()


if __name__ == "__main__":

    repair_from_excel(
        # r"Z:\Topnotch Group\Public\Testing APP\excel_export\inventory_data.xlsx"
        r"Z:\Topnotch Group\Public\Testing APP\excel_export\inventory1row.xlsx"
        
    )