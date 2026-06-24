import sys
import subprocess

print("Step 1")
subprocess.run(
    [sys.executable, "database_export/export_scan_traveler.py"],
    check=True
)

print("Step 2")
subprocess.run(
    [sys.executable, "database_export/export_data_from_excel_all.py"],
    check=True
)

print("Step 3")
subprocess.run(
    [sys.executable, "database_export/check_scan_traveler.py"],
    check=True
)

print("Step 4")
subprocess.run(
    [sys.executable, "database_export/check_scan_traveler2026.py"],
    check=True
)

print("Done")