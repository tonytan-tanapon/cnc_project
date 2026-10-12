import os
import re
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlencode

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse


router = APIRouter(
    prefix="/po_files",
    tags=["PO Files"],
)

# Change this to your actual folder on the server.
FILE_ROOT = Path(
    r"Z:\Topnotch Group\Public\2026"
).resolve()

def make_po_pattern(po_number: str):
    po_number = po_number.strip()

    if not re.fullmatch(r"[A-Za-z0-9_-]{1,100}", po_number):
        raise HTTPException(
            400,
            "Invalid PO number. Use letters, numbers, - or _.",
        )

    return re.compile(
        re.escape(po_number),
        re.IGNORECASE,
    )


def get_safe_file(relative_path: str):
    try:
        file_path = (FILE_ROOT / relative_path).resolve()

        # Only allow files inside FILE_ROOT.
        file_path.relative_to(FILE_ROOT)

        if not file_path.is_file():
            raise HTTPException(404, "File not found.")

        return file_path

    except (ValueError, OSError, RuntimeError):
        raise HTTPException(404, "File not found.")

@router.get("/search")
def search_files(
    po_number: str = Query(..., min_length=1, max_length=100),
):
    po_number = po_number.strip()
    pattern = make_po_pattern(po_number)

    if not FILE_ROOT.is_dir():
        raise HTTPException(
            503,
            "File folder is unavailable. Check path and server permissions.",
        )

    files = []

    def scan_error(error):
        raise HTTPException(
            503,
            "Cannot read file folder. Check server permissions.",
        )

    for folder, _, filenames in os.walk(
        FILE_ROOT,
        followlinks=False,
        onerror=scan_error,
    ):
        for filename in filenames:
            if not pattern.search(Path(filename).stem):
                continue

            source = Path(folder) / filename
            relative_path = source.relative_to(FILE_ROOT).as_posix()

            try:
                file_path = get_safe_file(relative_path)
                file_stat = file_path.stat()
                size_bytes = file_stat.st_size

                # Creation time on Windows.
                created_timestamp = getattr(
                    file_stat, "st_birthtime", None
                )

                if created_timestamp is None and os.name == "nt":
                    created_timestamp = file_stat.st_ctime

                created_at = (
                    datetime.fromtimestamp(
                        created_timestamp,
                        tz=timezone.utc,
                    ).isoformat()
                    if created_timestamp is not None
                    else None
                )

            except (HTTPException, OSError, ValueError, OverflowError):
                continue

            files.append({
                "name": filename,
                "folder": source.parent.relative_to(FILE_ROOT).as_posix(),
                "size_bytes": size_bytes,
                "created_at": created_at,
                "download_url": "/api/v1/po_files/download?" + urlencode({
                    "po_number": po_number,
                    "file": relative_path,
                }),
            })

    files.sort(
        key=lambda item: (
            item["name"].casefold(),
            item["folder"].casefold(),
        )
    )

    return {
        "po_number": po_number,
        "count": len(files),
        "files": files,
    }

@router.get("/download")
def download_file(
    po_number: str = Query(..., min_length=1, max_length=100),
    file: str = Query(..., min_length=1, max_length=2000),
):
    pattern = make_po_pattern(po_number)
    file_path = get_safe_file(file)

    if not pattern.search(file_path.stem):
        raise HTTPException(404, "File does not match this PO number.")

    return FileResponse(
        path=file_path,
        filename=file_path.name,
        media_type="application/octet-stream",
    )