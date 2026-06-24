from fastapi import APIRouter
from threading import Thread
import subprocess
import sys
from pathlib import Path

router = APIRouter(
    prefix="/service",
    tags=["service"]
)

process_status = {
    "status": "idle"
}

def traveler_close_worker():

    print("WORKER STARTED")

    global process_status

    process_status["status"] = "running"

    try:

        project_root = Path(__file__).resolve().parents[2]

        script_path = (
            project_root /
            "database_export" /
            "get_shop_traveler_for_close.py"
        )

        print("PROJECT:", project_root)
        print("SCRIPT:", script_path)

        result = subprocess.run(
            [sys.executable, str(script_path)],
            cwd=str(project_root),
            capture_output=True,
            text=True
        )

        print("RETURN CODE:", result.returncode)
        print("STDOUT:", result.stdout)
        print("STDERR:", result.stderr)

        if result.returncode == 0:

            process_status["status"] = "completed"

        else:

            process_status["status"] = "error"
            process_status["message"] = result.stderr

    except Exception as e:

        print("EXCEPTION:", e)

        process_status["status"] = "error"
        process_status["message"] = str(e)

@router.post("/run-traveler-close")
def run_traveler_close():
    print("RUN API CALLED")

    global process_status

    if process_status["status"] == "running":

        return {
            "status": "already_running"
        }

    process_status = {
    "status": "running",
    "message": ""
}

    worker = Thread(
        target=traveler_close_worker,
        daemon=True
    )

    worker.start()

    return {
        "status": "started"
    }


@router.get("/traveler-close-status")
def traveler_close_status():

    return process_status