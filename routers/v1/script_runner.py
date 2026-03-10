from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from database import get_db

import subprocess
import os

router = APIRouter(prefix="/script", tags=["script"])

@router.post("/import-excel")
def run_import(db: Session = Depends(get_db)):
    try:
        script_path = r"C:\Users\TPSERVER\dev\cnc_project\database_import\import_excel_to_database.py"
        python_exe = r"C:\Users\TPSERVER\dev\cnc_project\venv\Scripts\python.exe"

        result = subprocess.run(
            [python_exe, script_path],
            capture_output=True,
            text=True
        )

        return {
            "status": "success" if result.returncode == 0 else "error",
            "output": result.stdout,
            "error": result.stderr
        }

    except Exception as e:
        return {"status": "exception", "message": str(e)}