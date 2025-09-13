import pandas as pd

path = r"C:\Users\TPSERVER\Downloads\\"
file_name = "02-1031.xlsm"

file = path+file_name
print(file)
# List sheets
xls = pd.ExcelFile(file, engine="openpyxl")
print(xls.sheet_names)

# Read a specific sheet (adjust sheet_name)
df = pd.read_excel(file, sheet_name=xls.sheet_names[0], engine="openpyxl")
# print(df)
# # If headers aren’t on the first row, try:
# df = pd.read_excel(file, sheet_name=xls, header=2)

# # Save to CSV/JSON
df.to_csv("./excel/02-1031_YourSheet.csv", index=False, encoding="utf-8")
# df.to_json("02-1031_YourSheet.json", orient="records", force_ascii=False)
