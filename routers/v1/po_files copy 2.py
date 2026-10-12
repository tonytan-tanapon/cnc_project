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

PUBLIC_ROOT = Path(r"Z:\Topnotch Group\Public")

FILE_ROOTS = {
    "scanned": (
        PUBLIC_ROOT / "Scanned Drawing with Lot"
    ).resolve(),
    **{
        str(year): (PUBLIC_ROOT / str(year)).resolve()
        for year in range(2013, 2027)
    },
}


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


def get_safe_file(root_key: str, relative_path: str):
    root = FILE_ROOTS.get(root_key)

    if root is None:
        raise HTTPException(404, "Unknown file folder.")

    try:
        file_path = (root / relative_path).resolve()

        # Only allow files inside the selected root.
        file_path.relative_to(root)

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

    files = []
    warnings = []
    available_roots = 0

    for root_key, root in FILE_ROOTS.items():
        try:
            if not root.is_dir():
                warnings.append(
                    f"Folder unavailable: {root.name}"
                )
                continue
        except OSError:
            warnings.append(
                f"Cannot access folder: {root.name}"
            )
            continue

        available_roots += 1

        def scan_error(error):
            warnings.append(
                f"Could not read a subfolder in: {root.name}"
            )

        for folder, _, filenames in os.walk(
            root,
            followlinks=False,
            onerror=scan_error,
        ):
            for filename in filenames:
                # Only include PDF files (.pdf or .PDF).
                if Path(filename).suffix.lower() != ".pdf":
                    continue

             
                if not pattern.search(Path(filename).stem):
                    continue

                source = Path(folder) / filename
                relative_path = source.relative_to(root).as_posix()

                try:
                    file_path = get_safe_file(
                        root_key,
                        relative_path,
                    )
                    file_stat = file_path.stat()

                    # Creation time on Windows.
                    created_timestamp = getattr(
                        file_stat,
                        "st_birthtime",
                        None,
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

                except (
                    HTTPException,
                    OSError,
                    ValueError,
                    OverflowError,
                ):
                    warnings.append(
                        f"Could not read file: "
                        f"{root.name}/{relative_path}"
                    )
                    continue

                subfolder = source.parent.relative_to(root)

                # Show the root folder too, for example:
                # 2026/CustomerA or Scanned Drawing with Lot
                display_folder = (
                    root.name
                    if subfolder == Path(".")
                    else f"{root.name}/{subfolder.as_posix()}"
                )

                files.append({
                    "name": filename,
                    "folder": display_folder,
                    "size_bytes": file_stat.st_size,
                    "created_at": created_at,
                    "download_url": (
                        "/api/v1/po_files/download?"
                        + urlencode({
                            "po_number": po_number,
                            "root": root_key,
                            "file": relative_path,
                        })
                    ),
                    "preview_url": (
                        "/api/v1/po_files/preview?"
                        + urlencode({
                            "po_number": po_number,
                            "root": root_key,
                            "file": relative_path,
                        })
                    ),
                })

    if available_roots == 0:
        raise HTTPException(
            503,
            "All file folders are unavailable. "
            "Check paths and server permissions.",
        )

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
        "warnings": sorted(set(warnings)),
    }


@router.get("/download")
def download_file(
    po_number: str = Query(..., min_length=1, max_length=100),
    root: str = Query(..., min_length=1, max_length=100),
    file: str = Query(..., min_length=1, max_length=2000),
):
    pattern = make_po_pattern(po_number)
    file_path = get_safe_file(root, file)

    if not pattern.search(file_path.stem):
        raise HTTPException(
            404,
            "File does not match this PO number.",
        )

    return FileResponse(
        path=file_path,
        filename=file_path.name,
        media_type="application/octet-stream",
    )


@router.get("/preview")
def preview_file(
    po_number: str = Query(..., min_length=1, max_length=100),
    root: str = Query(..., min_length=1, max_length=100),
    file: str = Query(..., min_length=1, max_length=2000),
):
    pattern = make_po_pattern(po_number)
    file_path = get_safe_file(root, file)

    if (
        file_path.suffix.lower() != ".pdf"
        or not pattern.search(file_path.stem)
    ):
        raise HTTPException(404, "PDF does not match this PO number.")

    return FileResponse(
        path=file_path,
        filename=file_path.name,
        media_type="application/pdf",
        content_disposition_type="inline",
    )