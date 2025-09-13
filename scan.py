# save as scan_files.py
import argparse
import csv
from pathlib import Path
from datetime import datetime

FIELDS = ["path", "name", "parent", "ext", "size_bytes", "modified_iso"]

def iter_files(root: Path):
    root = root.resolve()
    for p in root.rglob("*"):
        if p.is_file():
            try:
                st = p.stat()
                yield {
                    "path": str(p),
                    "name": p.name,
                    "parent": str(p.parent),
                    "ext": p.suffix,
                    "size_bytes": st.st_size,
                    "modified_iso": datetime.fromtimestamp(st.st_mtime).isoformat(timespec="seconds"),
                }
            except Exception as e:
                # If a file can't be read (permissions, etc.), skip it gracefully
                # You can also log the error instead of silently skipping.
                continue

def main():
    ap = argparse.ArgumentParser(description="List files (path + name) recursively.")
    ap.add_argument("root", nargs="?", default=".", help="Root folder to scan (default: current folder)")
    ap.add_argument("--csv", help="Optional CSV output file, e.g. files.csv")
    args = ap.parse_args()

    if args.csv:
        with open(args.csv, "w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=FIELDS)
            w.writeheader()
            for row in iter_files(Path(args.root)):
                w.writerow(row)
        print(f"Wrote {args.csv}")
    else:
        # Just print full paths if no CSV requested
        for row in iter_files(Path(args.root)):
            print(row["path"])

if __name__ == "__main__":
    main()
