import pandas as pd
import os
import re

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

FILE1 = os.path.join(BASE_DIR, "merge_lot", "file1.csv")
FILE2 = os.path.join(BASE_DIR, "merge_lot", "file2.csv")
OUTPUT = os.path.join(BASE_DIR, "merge_lot", "result.csv")

# Load CSVs
df1 = pd.read_csv(FILE1, engine="python", usecols=range(20))
df2 = pd.read_csv(FILE2, engine="python", usecols=range(20))

# Remove all Unnamed columns
df1 = df1.loc[:, ~df1.columns.str.contains("^Unnamed")]
df2 = df2.loc[:, ~df2.columns.str.contains("^Unnamed")]

# Normalize headers
df1.columns = df1.columns.map(lambda x: x.strip().replace("\ufeff",""))
df2.columns = df2.columns.map(lambda x: x.strip().replace("\ufeff",""))

# Normalize LOT column names
LOT_NAMES = ["lot#", "lot #", "lot", "lot no", "lot no.", "lot number"]

for col in df1.columns:
    if col.lower() in LOT_NAMES:
        df1 = df1.rename(columns={col: "Lot"})
for col in df2.columns:
    if col.lower() in LOT_NAMES:
        df2 = df2.rename(columns={col: "Lot"})

# Force LOT column to string
df1["Lot"] = df1["Lot"].astype(str)
df2["Lot"] = df2["Lot"].astype(str)

# Clean LOT values
def clean_lot(x):
    x = str(x).strip().replace("\ufeff","")
    x = re.sub(r"[^A-Za-z0-9\-]", "", x)  # remove weird chars
    return x

df1["Lot"] = df1["Lot"].map(clean_lot)
df2["Lot"] = df2["Lot"].map(clean_lot)

# Debug
print("df1 Lot dtype:", df1["Lot"].dtype)
print("df2 Lot dtype:", df2["Lot"].dtype)
print("df1 Lot sample:", df1["Lot"].head())
print("df2 Lot sample:", df2["Lot"].head())

# Merge
result = df1.merge(df2, on="Lot", how="left")

# Save
result.to_csv(OUTPUT, index=False)

print("Saved:", OUTPUT)
