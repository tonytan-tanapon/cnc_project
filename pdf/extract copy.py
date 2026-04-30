import pdfplumber
import re
import os
import pandas as pd
import numpy as np

# ======================================
# CONFIG
# ======================================
folder = r"Z:\Topnotch Group\Public\Testing APP\83742-001 ALL DATA\good\test"

# ======================================
# REGEX
# ======================================
pattern_full = re.compile(
    r"^\s*(\d+)\s+\d+\s+(.*?)\s+([0-9\.\-]+)\s+([0-9\.\-]+)\s+([0-9\.\-]+)\s+([0-9\.\-]+)"
)

pattern_short = re.compile(
    r"^\s*(\d+)\s+\d+\s+(.*?)\s+([0-9\.\-]+)\s+([0-9\.\-]+)"
)

# ======================================
# PARSE PDF
# ======================================
def parse_pdf(file_path, root_folder):
    results = []

    try:
        with pdfplumber.open(file_path) as pdf:
            for page in pdf.pages:
                text = page.extract_text()
                if not text:
                    continue

                lines = text.split("\n")

                i = 0
                while i < len(lines):
                    line = lines[i].strip()
                    data = None

                    m_full = pattern_full.match(line)
                    m_short = pattern_short.match(line)

                    if m_full:
                        data = {
                            "file": os.path.basename(file_path),
                            "lot": os.path.basename(root_folder),
                            "mem_no": int(m_full.group(1)),
                            "job_desc": m_full.group(2),
                            "nominal": float(m_full.group(3)),
                            "tolerance": float(m_full.group(4)),
                            "actual": float(m_full.group(5)),
                            "dev": float(m_full.group(6)),
                        }

                    elif m_short:
                        data = {
                            "file": os.path.basename(file_path),
                            "lot": os.path.basename(root_folder),
                            "mem_no": int(m_short.group(1)),
                            "job_desc": m_short.group(2),
                            "nominal": None,
                            "tolerance": float(m_short.group(3)),
                            "actual": float(m_short.group(4)),
                            "dev": None,
                        }

                    if data:
                        # attach extra line
                        if i + 1 < len(lines):
                            next_line = lines[i + 1].strip()
                            if not pattern_full.match(next_line) and not pattern_short.match(next_line):
                                data["extra"] = next_line
                                i += 1
                            else:
                                data["extra"] = None

                        results.append(data)

                    i += 1

    except Exception as e:
        print(f"❌ Error {file_path}: {e}")

    return results


# ======================================
# READ ALL PDFs
# ======================================
all_results = []

for root, dirs, files in os.walk(folder):
    for filename in files:
        if filename.lower().endswith(".pdf"):
            file_path = os.path.join(root, filename)
            print(f"📄 Processing: {file_path}")

            data = parse_pdf(file_path, root)
            all_results.extend(data)

# ======================================
# DATAFRAME
# ======================================
df = pd.DataFrame(all_results)

if df.empty:
    print("❌ No data extracted")
    exit()

# clean lot
df["lot"] = df["lot"].str.replace("LOT#", "", regex=False)

# feature type
def get_feature(extra):
    if not extra:
        return None
    return extra.split()[0]

df["feature"] = df["extra"].apply(get_feature)

# ======================================
# FILTER VALID DATA FOR CPK
# ======================================
df_valid = df.dropna(subset=["actual", "tolerance", "nominal"])

# ======================================
# CPK FUNCTION
# ======================================
def calc_cpk(group):
    data = group["actual"]

    if len(data) < 5:
        return None  # not enough samples

    mean = data.mean()
    std = data.std(ddof=1)

    if std == 0:
        return None

    nominal = group["nominal"].iloc[0]
    tol = group["tolerance"].iloc[0]

    usl = nominal + tol
    lsl = nominal - tol

    cpu = (usl - mean) / (3 * std)
    cpl = (mean - lsl) / (3 * std)

    return min(cpu, cpl)

# ======================================
# CPK CALCULATION (FIXED VERSION)
# ======================================
cpk_df = (
    df_valid
    .groupby(["mem_no", "job_desc"])
    .agg(cpk=("actual", lambda x: calc_cpk(df_valid.loc[x.index])))
    .reset_index()
)

# ======================================
# CLASSIFY CPK
# ======================================
def classify_cpk(cpk):
    if cpk is None or pd.isna(cpk):
        return "NO DATA"
    elif cpk > 1.67:
        return "EXCELLENT"
    elif cpk > 1.33:
        return "GOOD"
    elif cpk >= 1.0:
        return "WARNING"
    else:
        return "BAD"

cpk_df["status"] = cpk_df["cpk"].apply(classify_cpk)

# ======================================
# OUTPUT
# ======================================
print("\n📊 RAW DATA SAMPLE:")
print(df.head(10))

print("\n📊 CPK RESULTS:")
print(cpk_df)

# save files
df.to_csv("raw_measurements.csv", index=False)
cpk_df.to_csv("cpk_results.csv", index=False)

print("\n💾 Saved:")
print(" - raw_measurements.csv")
print(" - cpk_results.csv")