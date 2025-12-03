import pandas as pd
import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

FILE1 = os.path.join(BASE_DIR, "merge_lot", "file1.csv")
FILE2 = os.path.join(BASE_DIR, "merge_lot", "file2.csv")
OUTPUT = os.path.join(BASE_DIR, "merge_lot", "result.csv")

# --- Load CSVs safely ---
df1 = pd.read_csv(FILE1, engine="python", skip_blank_lines=True)
df2 = pd.read_csv(FILE2, engine="python", skip_blank_lines=True)

# --- Clean column names ---
df1.columns = df1.columns.str.strip()
df2.columns = df2.columns.str.strip()

# --- Rename lot columns ---
df1.rename(columns={"Lot#": "Lot"}, inplace=True)
df2.rename(columns={"Lot Number": "Lot"}, inplace=True)

# --- Clean lot values ---
df1["Lot"] = df1["Lot"].astype(str).str.strip()
df2["Lot"] = df2["Lot"].astype(str).str.strip()

# --- Merge ---
merged = pd.merge(df1, df2, on="Lot", how="inner")

# --- Save ---
merged.to_csv(OUTPUT, index=False)

print("Merged rows:", len(merged))
print("Saved to:", OUTPUT)
