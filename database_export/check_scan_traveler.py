import pandas as pd

# =========================================
# FILE PATHS
# =========================================

file_list_path = r"Z:\Topnotch Group\Public\Testing APP\ScanList\file_list.xlsx"

lot_report_path = r"Z:\Topnotch Group\Public\Testing APP\ScanList\lot_report_format.xlsx"

# =========================================
# READ EXCEL
# =========================================

df_file = pd.read_excel(file_list_path)

df_lot = pd.read_excel(lot_report_path)

# =========================================
# REMOVE SPACE FROM COLUMN NAMES
# =========================================

df_file.columns = df_file.columns.str.strip()
df_lot.columns = df_lot.columns.str.strip()

# =========================================
# COLUMN NAMES
# =========================================

lot_col = "Lot#"
part_col = "Part No."
ship_col = "Real Shipped Date"
file_col = "File Name"

# =========================================
# CLEAN FILE LIST
# =========================================

df_file[file_col] = (
    df_file[file_col]
    .astype(str)
    .str.strip()
    .str.upper()
)

# =========================================
# RESULT
# =========================================

results = []

# =========================================
# LOOP LOT REPORT
# =========================================

for _, row in df_lot.iterrows():

    # =====================================
    # GET DATA
    # =====================================

    lot_no = str(
        row[lot_col]
    ).strip().upper()

    part_no = str(
        row[part_col]
    ).strip().upper()

    # =====================================
    # REAL SHIPPED DATE
    # =====================================

    shipped_date = row.get(
        ship_col,
        ""
    )

    # format datetime
    if pd.notna(shipped_date):

        try:
            shipped_date = pd.to_datetime(
                shipped_date
            ).strftime("%Y-%m-%d")

        except:
            shipped_date = str(shipped_date)

    else:
        shipped_date = ""

    # =====================================
    # FIND MATCH FILE
    # =====================================

    matched_files = []

    for file_name in df_file[file_col]:

        if lot_no in file_name:

            matched_files.append(
                file_name
            )

    # =====================================
    # IF NOT FOUND
    # =====================================

    if len(matched_files) == 0:

        results.append({

            "Lot#": lot_no,
            "Part No.": part_no,
            "Real Shipped Date": shipped_date,
            "Matched File": "",
            "Status": "MISSING"

        })

    # =====================================
    # FOUND
    # =====================================

    else:

        for f in matched_files:

            results.append({

                "Lot#": lot_no,
                "Part No.": part_no,
                "Real Shipped Date": shipped_date,
                "Matched File": f,
                "Status": "FOUND"

            })

# =========================================
# CREATE RESULT DATAFRAME
# =========================================

df_result = pd.DataFrame(results)

# =========================================
# EXPORT
# =========================================

output_path = r"Z:\Topnotch Group\Public\Testing APP\ScanList\lot_file_compare.xlsx"

df_result.to_excel(
    output_path,
    index=False
)

# =========================================
# DONE
# =========================================

print("=================================")
print("DONE")
print("=================================")
print(f"Exported : {output_path}")
print(f"Total rows : {len(df_result)}")
print("=================================")