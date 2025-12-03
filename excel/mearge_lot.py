import pandas as pd
import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

FILE1 = os.path.join(BASE_DIR, "merge_lot", "file1.csv")
FILE2 = os.path.join(BASE_DIR, "merge_lot", "file2.csv")
OUTPUT = os.path.join(BASE_DIR, "merge_lot", "result.csv")

# --- Load CSVs ---
df1 = pd.read_csv(FILE1, engine="python")
df2 = pd.read_csv(FILE2, engine="python")

# --- Normalize Lot column names ---
def normalize_lot_column(df):
    for col in df.columns:
        if col.strip().lower() in ["lot#", "lot #", "lot", "lot no", "lot no.", "lot number"]:
            df.rename(columns={col: "Lot"}, inplace=True)
            break
    return df

df1 = normalize_lot_column(df1)
df2 = normalize_lot_column(df2)

# # print(df1)

# --- Clean Lot values ---
df1["Lot"] = df1["Lot"].astype(str).str.strip().str.replace(r"[^A-Za-z0-9\-]", "", regex=True)
df2["Lot"] = df2["Lot"].astype(str).str.strip().str.replace(r"[^A-Za-z0-9\-]", "", regex=True)

# # --- Debug print ---
# print("DF1 Lots sample:", df1["Lot"].head())
print("DF2 Lots sample:", df2["Lot"].head())

# # --- Merge ---
# merged = pd.merge(df1, df2, on="Lot", how="inner")

# # --- Save result ---
# merged.to_csv(OUTPUT, index=False)
# # print("Merged rows:", len(merged))
# # print("Saved to:", OUTPUT)
