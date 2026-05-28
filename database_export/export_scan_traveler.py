import os
import pandas as pd

# =========================================
# ROOT FOLDER
# =========================================

root_folder = r"Z:\Topnotch Group\Public\AS9100\Shop Traveler\Shop Traveler Scan"

# =========================================
# STORE FILE DATA
# =========================================

rows = []

# =========================================
# WALK THROUGH ALL SUBFOLDERS
# =========================================

for current_path, folders, files in os.walk(root_folder):

    for file_name in files:

        full_path = os.path.join(
            current_path,
            file_name
        )

        folder_name = os.path.basename(
            current_path
        )

        ext = os.path.splitext(
            file_name
        )[1]

        rows.append({
            "Folder": folder_name,
            "File Name": file_name,
            "Extension": ext,
            "Full Path": full_path
        })

# =========================================
# CREATE DATAFRAME
# =========================================

df = pd.DataFrame(rows)

# =========================================
# EXPORT EXCEL
# =========================================

output_file = r"Z:\Topnotch Group\Public\Testing APP\ScanList\file_list.xlsx"

df.to_excel(
    output_file,
    index=False
)

print("DONE")
print(f"Exported: {output_file}")
print(f"Total files: {len(df)}")