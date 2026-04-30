import pandas as pd
import matplotlib.pyplot as plt

# ======================================
# LOAD DATA
# ======================================
df = pd.read_csv(r"Z:\Topnotch Group\Public\Testing APP\83742-001 ALL DATA\good\test\raw_measurements.csv")

# ======================================
# PLOT MEM WITH LSL / USL
# ======================================
def plot_mem(df, mem_no):
    data = df[df["mem_no"] == mem_no]

    if data.empty:
        print("No data")
        return

    values = data["actual"].dropna()

    nominal = data["nominal"].iloc[0]
    tol = data["tolerance"].iloc[0]

    usl = nominal + tol
    lsl = nominal - tol

    plt.figure()

    plt.plot(values.values, marker='o', label="Actual")

    plt.axhline(nominal, linestyle='--', label="Nominal")
    plt.axhline(usl, linestyle='--', label="USL")
    plt.axhline(lsl, linestyle='--', label="LSL")

    plt.title(f"mem_no {mem_no}")
    plt.xlabel("Sample")
    plt.ylabel("Value")

    plt.legend()
    plt.show()

# ======================================
# HISTOGRAM
# ======================================
def plot_hist(df, mem_no):
    data = df[df["mem_no"] == mem_no]

    if data.empty:
        print("No data")
        return

    values = data["actual"].dropna()

    nominal = data["nominal"].iloc[0]
    tol = data["tolerance"].iloc[0]

    usl = nominal + tol
    lsl = nominal - tol

    mean = values.mean()

    plt.figure()

    # 🔵 histogram
    plt.hist(values, bins=15, density=True, alpha=0.6)

    # 🔴 spec lines
    plt.axvline(usl, linestyle='--', label="USL")
    plt.axvline(lsl, linestyle='--', label="LSL")

    # 🟢 nominal + mean
    plt.axvline(nominal, linestyle='--', label="Nominal")
    plt.axvline(mean, linestyle='-', label="Mean")

    # 🔥 highlight spec zone
    plt.axvspan(lsl, usl, alpha=0.2)

    plt.title(f"Histogram (SPC): mem_no {mem_no}")
    plt.xlabel("Measurement")
    plt.ylabel("Density")

    plt.legend()
    plt.show()


import numpy as np
from scipy.stats import norm

import os

def plot_hist_advanced(df, mem_no, save_dir = r"Z:\Topnotch Group\Public\Testing APP\83742-001 ALL DATA\good\test\plot"):
    data = df[df["mem_no"] == mem_no]

    if data.empty:
        return

    values = data["actual"].dropna()

    nominal = data["nominal"].iloc[0]
    tol = data["tolerance"].iloc[0]

    usl = nominal + tol
    lsl = nominal - tol

    mean = values.mean()
    std = values.std()

    # 📁 create folder
    os.makedirs(save_dir, exist_ok=True)

    plt.figure()
    plt.figure(figsize=(12, 6))
    # histogram
    plt.hist(values, bins=15, alpha=0.6)

    # spec
    plt.axvline(usl, linestyle='--', label="USL")
    plt.axvline(lsl, linestyle='--', label="LSL")
    plt.axvline(nominal, linestyle='--', label="Nominal")
    plt.axvline(mean, linestyle='-', label="Mean")

    plt.axvspan(lsl, usl, alpha=0.2)

    plt.title(f"mem_no {mem_no}")
    plt.legend()
    
    # 💾 save file
    filename = os.path.join(save_dir, f"mem_{mem_no}.png")
    plt.savefig(filename, dpi=150)

    plt.close()

# ======================================
# RUN
# ======================================
# plot_mem(df, 71)
# plot_hist(df, 71)

for i in range(71,96):
    plot_hist_advanced(df, i)