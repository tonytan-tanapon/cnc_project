

import os
import glob
import pandas as pd

def collect_files_and_sheets(base_dir):
    pattern = os.path.join(base_dir, "*.xls*")
    files = glob.glob(pattern)
    i = 0 
    pairs = []
    for f in files:
        if os.path.basename(f).startswith("~$"):  # skip Excel temp/lock files
            continue

        try:
            xl = pd.ExcelFile(f)
            for sheet in xl.sheet_names:
                print(sheet)
                # normalize path to use forward slashes for Python raw string
                norm_path = f.replace("\\", "/")
                pairs.append((rf"{norm_path}", sheet))

                # if(i>10):
                #     return pairs
                # i+=1
        except Exception as e:
            print(f"⚠️ Could not read {f}: {e}")
    return pairs


if __name__ == "__main__":
    BASE_DIR = r"Z:\Topnotch Group\Public\Data Base & Inventory Stock\Data"
    FILES = collect_files_and_sheets(BASE_DIR)

    # Save into a Python file for later use
    out_file = "file_sheet_list.txt"
    with open(out_file, "w", encoding="utf-8") as f:
        f.write("FILES = [\n")
        for path, sheet in FILES:
            f.write(f"    (r\"{path}\", \"{sheet}\"),\n")
        f.write("]\n")

    print(f"✅ Saved {len(FILES)} entries into {out_file}")