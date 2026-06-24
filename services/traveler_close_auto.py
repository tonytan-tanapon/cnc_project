import subprocess
import sys
from pathlib import Path


def run_traveler_close():

    project_root = Path(__file__).resolve().parents[1]

    script_path = (
        project_root /
        "database_export" /
        "get_shop_traveler_for_close.py"
    )

    print("AUTO RUN TRAVELER CLOSE")

    result = subprocess.run(
        [sys.executable, str(script_path)],
        cwd=str(project_root),
        text=True
    )

    print("RETURN CODE:", result.returncode)