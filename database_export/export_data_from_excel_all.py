import pandas as pd
import os

# folder_path = r"Z:\Topnotch Group\Public\Data Base & Inventory Stock\Data\app"
folder_path = r"Z:\Topnotch Group\Public\Data Base & Inventory Stock\Data"

output_rows = []
i = 1
for file_name in os.listdir(folder_path):
    # if i>10:           
    #         print("⛔ Stopping after 10 files for testing.")
    #         break
    # i+=1  
    # print(i)
    if file_name.endswith(".xlsm") :
        
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
# FINAL OUTPUT
# ===============================
final_df = pd.DataFrame(output_rows)

# ✅ Create Date from PO Date
final_df["Date"] = final_df["PO Date"]

# 🔥 Convert to datetime
final_df["Date"] = pd.to_datetime(final_df["Date"], errors="coerce")
final_df["Due Date"] = pd.to_datetime(final_df["Due Date"], errors="coerce")

# 🔥 Format like your example (MM/DD/YY)
final_df["Date"] = final_df["Date"].dt.strftime("%m/%d/%Y")
final_df["Due Date"] = final_df["Due Date"].dt.strftime("%m/%d/%Y")

# 🔥 Reorder columns to match your required format
final_df = final_df[[
    "Date",
    "Customer",
    "Lot Number",
    "PO Number",
    "Part No",
    "Part Name",
    "Rev",
    "Due Date",
    "Qty PO",
    "Qty Shipped",
    "First Article No",
    "Remark Product Control",
    "Tracking No",
    "Real Shipped Date"

]]


# 🔥 Rename columns to EXACT format
final_df = final_df.rename(columns={
    "Customer": "Name",
    "Lot Number": "Lot#",
    "PO Number": "PO",
    "Part No": "Part No.",
    "Part Name": "Description",
    "Rev": "Rev."
})

# Save
output_folder_path = "C:\\Users\\TPSERVER\\dev\\cnc_project\\database_export\\output"
output_file = os.path.join(output_folder_path, "lot_report_format.xlsx")
final_df.to_excel(output_file, index=False)

print("✅ DONE! File created:", output_file)