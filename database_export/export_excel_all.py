import pandas as pd
import os

folder_path = r"Z:\Topnotch Group\Public\Testing APP\excel_export\Data"
# folder_path = r"Z:\Topnotch Group\Public\Data Base & Inventory Stock\Data"

output_rows = []
i = 1
for file_name in os.listdir(folder_path):
    
    if file_name.endswith(".xlsm") :
        
        file_path = os.path.join(folder_path, file_name)
        print(f"Processing: {file_name}")
            
        try:
            df = pd.read_excel(file_path, header=None, engine="openpyxl")
            print(df)
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
                    # 🔥 FROM HEADER (same for all rows in file)
                    "Part No": part_no,
                    "Part Name": part_name,
                    "Rev": rev,
                    "Customer": customer,

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
                    "INCOMING STOCK": df.iloc[idx, 12],
                    "Receive QTY": df.iloc[idx, 13],
                    "Name Inspection": df.iloc[idx, 14],
                    "*Remark (QA Inspection)": df.iloc[idx, 15],
                    "Rework/Repair": df.iloc[idx, 16],
                    "*Remark (Rework)": df.iloc[idx, 17],
                    "Qty Reject": df.iloc[idx, 18],
                    "*Remark (Reject)": df.iloc[idx, 19],
                    "Incoming Rework": df.iloc[idx, 20],
                    "Finish goods in stock": df.iloc[idx, 21],
                    "Lot Number": df.iloc[idx, 22],
                    "PO Number": df.iloc[idx, 23],
                    "Qty Take Out": df.iloc[idx, 24],
                    "Date Take Out Stock": df.iloc[idx, 25],
                    "Blank": df.iloc[idx, 26],
                    "WIP": df.iloc[idx, 27],
                    "WIP Cont w/Lot": df.iloc[idx, 28],
                    "QTY Rework": df.iloc[idx, 29],
                    "Green Tag": df.iloc[idx, 30],
                    "Rework w lot": df.iloc[idx, 31],
                    "QTY Prod": df.iloc[idx, 32],
                    "QTY Shipped": df.iloc[idx, 33],
                    "Residual": df.iloc[idx,34],
                    "QTY Used1": df.iloc[idx, 35],
                    "Balance1": df.iloc[idx, 36],
                    "BaScraplance1": df.iloc[idx, 37],
                    "From Lot1": df.iloc[idx, 38],
                    "Lot ST Status1": df.iloc[idx, 39],
                    "Note1": df.iloc[idx, 40],
                    "date2": df.iloc[idx, 41],
                    # "Date": df.iloc[idx, 42],
                    # "Tracking No31": df.iloc[idx, 43],
                   

                  
                    
                })

        except Exception as e:
            print(f"Error in {file_name}: {e}")

# # ===============================
# # FINAL OUTPUT
# # ===============================
final_df = pd.DataFrame(output_rows)

# ✅ Create Date from PO Date
final_df["Date"] = final_df["PO Date"]

# 🔥 Convert to datetime
final_df["Date"] = pd.to_datetime(final_df["Date"], errors="coerce")
final_df["Due Date"] = pd.to_datetime(final_df["Due Date"], errors="coerce")

# 🔥 Format like your example (MM/DD/YY)
final_df["Date"] = final_df["Date"].dt.strftime("%m/%d/%Y")
final_df["Due Date"] = final_df["Due Date"].dt.strftime("%m/%d/%Y")
final_df["PO Date"] = final_df["PO Date"].dt.strftime("%m/%d/%Y")

# # 🔥 Reorder columns to match your required format
# final_df = final_df[[
#     "Date",
#     "Customer",
#     "Lot Number",
#     "PO Number",
#     "Part No",
#     "Part Name",
#     "Rev",
#     "Due Date",
#     "Qty PO",
#     "Qty Shipped",
#     "First Article No",
#     "Remark Product Control",
#     "Tracking No",
#     "Real Shipped Date"

# ]]


# # 🔥 Rename columns to EXACT format
# final_df = final_df.rename(columns={
#     "Customer": "Name",
#     "Lot Number": "Lot#",
#     "PO Number": "PO",
#     "Part No": "Part No.",
#     "Part Name": "Description",
#     "Rev": "Rev."
# })

# Save
output_folder_path = r"Z:\Topnotch Group\Public\Testing APP\excel_export"

output_file = os.path.join(
    output_folder_path,
    "test.xlsx"
)

final_df.to_excel(
    output_file,
    index=False
)

print(
    "✅ DONE! File created:",
    output_file
)