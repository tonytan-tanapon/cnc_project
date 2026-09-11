import pandas as pd
import os

from sqlalchemy import create_engine, text


# ============================================================
# CONFIG
# ============================================================

# Production
folder_path = r"Z:\Topnotch Group\Public\Data Base & Inventory Stock\Data"

# Test
# folder_path = r"C:\Users\TPSERVER\Desktop\test"

DATABASE_URL = (
    "postgresql+psycopg2://postgres:1234@100.88.56.126:5432/mydb"
)

engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True
)

output_rows = []


# ============================================================
# HELPER
# ============================================================

def clean_value(value):
    """Convert NaN / NaT to None."""
    if pd.isna(value):
        return None

    return value


def clean_text(value):
    """Convert Excel value to clean string."""

    if pd.isna(value):
        return None

    value = str(value).strip()

    if value == "":
        return None

    # Excel sometimes gives 12345.0
    if value.endswith(".0"):
        try:
            return str(int(float(value)))
        except (ValueError, TypeError):
            pass

    return value


def clean_int(value):
    """Convert Excel value to integer."""

    if pd.isna(value):
        return None

    try:
        return int(float(value))

    except (ValueError, TypeError):
        return None


def clean_datetime(value):
    """Convert Excel value to Python datetime."""

    if pd.isna(value):
        return None

    try:
        return pd.to_datetime(value).to_pydatetime()

    except (ValueError, TypeError):
        return None


# ============================================================
# READ XLSM FILES
# ============================================================

for file_name in os.listdir(folder_path):

    # Skip non-xlsm files
    # Skip Excel temporary files: ~$xxxxx.xlsm
    if (
        not file_name.lower().endswith(".xlsm")
        or file_name.startswith("~$")
    ):
        continue

    file_path = os.path.join(
        folder_path,
        file_name
    )

    print(f"Processing: {file_name}")

    try:

        df = pd.read_excel(
            file_path,
            header=None,
            engine="openpyxl"
        )

        # ====================================================
        # HEADER
        # ====================================================

        part_no = clean_text(
            df.iloc[1, 2]
        )  # C2

        part_name = clean_text(
            df.iloc[1, 5]
        )  # F2

        rev = clean_text(
            df.iloc[1, 11]
        )  # L2

        customer = clean_text(
            df.iloc[1, 9]
        )  # J2


        # ====================================================
        # DATA START B7
        # ====================================================

        for idx in range(6, len(df)):

            lot_no = clean_text(
                df.iloc[idx, 1]
            )

            # Stop when Lot Number is empty
            if not lot_no:
                break

            output_rows.append({

                "Lot Number":
                    lot_no,

                "PO Number":
                    clean_text(
                        df.iloc[idx, 2]
                    ),

                "Prod Qty":
                    clean_int(
                        df.iloc[idx, 3]
                    ),

                "PO Date":
                    clean_datetime(
                        df.iloc[idx, 4]
                    ),

                "Qty PO":
                    clean_int(
                        df.iloc[idx, 5]
                    ),

                "Due Date":
                    clean_datetime(
                        df.iloc[idx, 6]
                    ),

                "Qty Shipped":
                    clean_int(
                        df.iloc[idx, 7]
                    ),

                "First Article No":
                    clean_text(
                        df.iloc[idx, 8]
                    ),

                "Remark Product Control":
                    clean_text(
                        df.iloc[idx, 9]
                    ),

                "Tracking No":
                    clean_text(
                        df.iloc[idx, 10]
                    ),

                "Real Shipped Date":
                    clean_datetime(
                        df.iloc[idx, 11]
                    ),

                # Header
                "Part No":
                    part_no,

                "Part Name":
                    part_name,

                "Rev":
                    rev,

                "Customer":
                    customer,

                # Debug
                "Source File":
                    file_name,
            })

    except Exception as e:

        print(
            f"ERROR {file_name}: {e}"
        )


# ============================================================
# DATAFRAME
# ============================================================

final_df = pd.DataFrame(
    output_rows
)

print()
print("=" * 70)
print(
    f"Total Excel rows: {len(final_df)}"
)
print("=" * 70)


# ============================================================
# SQL 1: UPDATE PRODUCTION LOT
# ============================================================

update_lot_sql = text("""
    UPDATE production_lots
    SET
        lot_po_qty = COALESCE(:lot_po_qty, lot_po_qty),
        lot_po_duedate = COALESCE(:lot_po_duedate, lot_po_duedate),
        note = COALESCE(:note, note),
        fair_note = COALESCE(:fair_note, fair_note)
    WHERE lot_no = :lot_no
    RETURNING id
""")


# ============================================================
# SQL 2: UPDATE CUSTOMER SHIPMENT
# ============================================================

update_shipment_sql = text("""
    UPDATE customer_shipments

    SET
        tracking_no =
            COALESCE(:tracking_no, tracking_no),

        shipped_at =
            COALESCE(:shipped_at, shipped_at)

    WHERE lot_id = :lot_id

    RETURNING id
""")


# ============================================================
# SQL 3: UPDATE CUSTOMER SHIPMENT ITEM
# ============================================================

update_shipment_item_sql = text("""
    UPDATE customer_shipment_items

    SET
        qty =
            COALESCE(:qty_shipped, qty)

    WHERE shipment_id = :shipment_id
      AND lot_id = :lot_id

    RETURNING id
""")


# ============================================================
# COUNTERS
# ============================================================

updated_lots = 0
updated_shipments = 0
updated_shipment_items = 0

lot_not_found = []
shipment_not_found = []
shipment_item_not_found = []


# ============================================================
# TRANSACTION
# ============================================================

with engine.begin() as conn:

    for _, row in final_df.iterrows():

        lot_no = clean_text(
            row["Lot Number"]
        )

        print()
        print("-" * 70)
        print(f"LOT: {lot_no}")


        # ====================================================
        # 1. UPDATE PRODUCTION LOT
        # ====================================================
        
        lot_params = {
            "lot_no": lot_no,
            "lot_po_qty":
                clean_int(row["Qty PO"]),
            "lot_po_duedate":
                clean_datetime(row["Due Date"]),
            "note":
                clean_text(row["Remark Product Control"]),
            "fair_note":
                clean_text(row["First Article No"]),
        }
        result = conn.execute(
            update_lot_sql,
            lot_params
        )

        lot_id = result.scalar()


        # ====================================================
        # LOT NOT FOUND
        # ====================================================

        if not lot_id:

            lot_not_found.append({

                "lot_no":
                    lot_no,

                "po_number":
                    clean_text(
                        row["PO Number"]
                    ),

                "part_no":
                    clean_text(
                        row["Part No"]
                    ),

                "source_file":
                    row["Source File"],
            })

            print(
                f"LOT NOT FOUND: {lot_no}"
            )

            # Cannot update shipment without lot_id
            continue


        updated_lots += 1

        print(
            f"LOT UPDATED "
            f"(lot_id={lot_id})"
        )


        # ====================================================
        # 2. UPDATE CUSTOMER SHIPMENT
        # ====================================================

        shipment_params = {

            "lot_id":
                lot_id,

            "tracking_no":
                clean_text(
                    row["Tracking No"]
                ),

            "shipped_at":
                clean_datetime(
                    row["Real Shipped Date"]
                ),
        }

        shipment_result = conn.execute(
            update_shipment_sql,
            shipment_params
        )

        shipment_id = shipment_result.scalar()


        # ====================================================
        # SHIPMENT NOT FOUND
        # ====================================================

        if not shipment_id:

            shipment_not_found.append({

                "lot_no":
                    lot_no,

                "lot_id":
                    lot_id,

                "tracking_no":
                    shipment_params["tracking_no"],

                "source_file":
                    row["Source File"],
            })

            print(
                f"SHIPMENT NOT FOUND "
                f"(lot_id={lot_id})"
            )

            # Cannot update item without shipment_id
            continue


        updated_shipments += 1

        print(
            f"SHIPMENT UPDATED "
            f"(shipment_id={shipment_id})"
        )


        # ====================================================
        # 3. UPDATE CUSTOMER SHIPMENT ITEM
        # ====================================================

        qty_shipped = clean_int(
            row["Qty Shipped"]
        )

        shipment_item_params = {

            "shipment_id":
                shipment_id,

            "lot_id":
                lot_id,

            "qty_shipped":
                qty_shipped,
        }

        shipment_item_result = conn.execute(
            update_shipment_item_sql,
            shipment_item_params
        )

        shipment_item_id = (
            shipment_item_result.scalar()
        )


        # ====================================================
        # SHIPMENT ITEM NOT FOUND
        # ====================================================

        if not shipment_item_id:

            shipment_item_not_found.append({

                "lot_no":
                    lot_no,

                "lot_id":
                    lot_id,

                "shipment_id":
                    shipment_id,

                "qty_shipped":
                    qty_shipped,

                "source_file":
                    row["Source File"],
            })

            print(
                "SHIPMENT ITEM NOT FOUND "
                f"(shipment_id={shipment_id})"
            )

            continue


        updated_shipment_items += 1

        print(
            f"SHIPMENT ITEM UPDATED "
            f"(shipment_item_id={shipment_item_id}, "
            f"qty={qty_shipped})"
        )


# ============================================================
# SUMMARY
# ============================================================

print()
print("=" * 70)
print("UPDATE COMPLETE")
print("=" * 70)

print(
    f"Excel rows             : {len(final_df)}"
)

print(
    f"Lots updated           : {updated_lots}"
)

print(
    f"Shipments updated      : {updated_shipments}"
)

print(
    f"Shipment items updated : {updated_shipment_items}"
)

print(
    f"Lots not found         : {len(lot_not_found)}"
)

print(
    f"Shipments not found    : {len(shipment_not_found)}"
)

print(
    f"Shipment items missing : {len(shipment_item_not_found)}"
)


# ============================================================
# LOT NOT FOUND DETAILS
# ============================================================

if lot_not_found:

    print()
    print("=" * 70)
    print("LOTS NOT FOUND")
    print("=" * 70)

    for item in lot_not_found:

        print(
            item["lot_no"],
            item["po_number"],
            item["part_no"],
            item["source_file"]
        )


# ============================================================
# SHIPMENT NOT FOUND DETAILS
# ============================================================

if shipment_not_found:

    print()
    print("=" * 70)
    print("SHIPMENTS NOT FOUND")
    print("=" * 70)

    for item in shipment_not_found:

        print(
            f"Lot: {item['lot_no']} | "
            f"lot_id: {item['lot_id']} | "
            f"tracking: {item['tracking_no']} | "
            f"file: {item['source_file']}"
        )


# ============================================================
# SHIPMENT ITEM NOT FOUND DETAILS
# ============================================================

if shipment_item_not_found:

    print()
    print("=" * 70)
    print("SHIPMENT ITEMS NOT FOUND")
    print("=" * 70)

    for item in shipment_item_not_found:

        print(
            f"Lot: {item['lot_no']} | "
            f"lot_id: {item['lot_id']} | "
            f"shipment_id: {item['shipment_id']} | "
            f"qty: {item['qty_shipped']} | "
            f"file: {item['source_file']}"
        )