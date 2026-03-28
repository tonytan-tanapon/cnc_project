import pandas as pd
import os

folder_path = r"Z:\Topnotch Group\Public\Data Base & Inventory Stock\Data"

output_rows = []

for file_name in os.listdir(folder_path):
    if file_name.endswith(".xlsm") or file_name.endswith(".xlsx"):
        
        file_path = os.path.join(folder_path, file_name)
        print(f"Processing: {file_name}")
        
        try:
            df = pd.read_excel(file_path, header=None, engine="openpyxl")

            # ===============================
            # 🔥 HEADER (fixed positions)
            # ===============================
            part_no = df.iloc[1, 2]      # C2
            part_name = df.iloc[1, 5]    # F2
            rev = df.iloc[1, 11]         # L2
            customer = df.iloc[1, 9]     # J2

            # ===============================
            # 🔥 DATA START (B7)
            # ===============================
            for idx in range(6, len(df)):

                lot_no = df.iloc[idx, 1]  # Column B

                # 🛑 STOP when Lot empty
                if pd.isna(lot_no) or str(lot_no).strip() == "":
                    # print(f"⛔ Stop at row {idx+1}")
                    break

                output_rows.append({
                    "Lot Number": lot_no,
                    "PO Number": df.iloc[idx, 2],
                    "Prod Qty": df.iloc[idx, 3],
                    "PO Date": df.iloc[idx, 4],
                    "Qty PO": df.iloc[idx, 5],
                    "Due Date": df.iloc[idx, 6],
                    "Qty Shipped": df.iloc[idx, 7],
                    "First Article No": df.iloc[idx, 8],
                    "Remark Product Control": df.iloc[idx, 9],
                    "Tracking No": df.iloc[idx, 10],
                    "Real Shipped Date": df.iloc[idx, 11],

                    # 🔥 FROM HEADER (same for all rows in file)
                    "Part No": part_no,
                    "Part Name": part_name,
                    "Rev": rev,
                    "Customer": customer,
                })

        except Exception as e:
            print(f"Error in {file_name}: {e}")

# ===============================
# 🔥 FINAL OUTPUT
# ===============================
final_df = pd.DataFrame(output_rows)

output_file = os.path.join(folder_path, "combined_lot_data.xlsx")
final_df.to_excel(output_file, index=False)

print("✅ DONE! File created:", output_file)