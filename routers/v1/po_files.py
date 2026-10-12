import os
import re
import stat
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlencode

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse


router = APIRouter(
    prefix="/po_files",
    tags=["PO Files"],
)

PUBLIC_ROOT = Path(
    r"\\topnotch\exchange\Topnotch Group\Public"
)

SCANNED_ROOT = (
    PUBLIC_ROOT / "Scanned Drawing with Lot"
)

FILE_ROOTS = {
    "scanned": SCANNED_ROOT,
    **{
        str(year): PUBLIC_ROOT / str(year)
        for year in range(2013, 2027)
    },
}

TYPE_FOLDER_ALIASES = {
    "ScanWithLot": (
        "Scanned Drawing with Lot",
        "ScanWithLot",
    ),
    "Supplier Cert": (
        "Supplier Cert",
    ),
    "Supplier PO": (
        "Supplier PO",
    ),
    "CofC": (
        "C of C",
        "CofC",
        "Certificate of Conformance",
        "Certificate of Conformity",
    ),
    "Material": (
        "Material Cert",
        "Material",
    ),
}


def normalize_name(value: str) -> str:
    return re.sub(r"[^a-z0-9]", "", value.lower())


def get_file_type(root_key: str, relative_path: str):
    if root_key == "scanned":
        return "ScanWithLot"

    folder_parts = Path(relative_path).parts[:-1]

    for folder_name in reversed(folder_parts):
        normalized_folder = normalize_name(folder_name)

        for file_type, aliases in TYPE_FOLDER_ALIASES.items():
            if any(
                normalize_name(alias) in normalized_folder
                for alias in aliases
            ):
                return file_type

    return None


def get_file_year(root_key: str, relative_path: str):
    # Main year folder takes priority over category folder names.
    if re.fullmatch(r"20\d{2}", root_key):
        return root_key

    for folder_name in Path(relative_path).parts[:-1]:
        if re.fullmatch(r"20\d{2}", folder_name):
            return folder_name

    return None


def make_po_pattern(po_number: str):
    po_number = po_number.strip()

    if not re.fullmatch(r"[A-Za-z0-9_-]{1,100}", po_number):
        raise HTTPException(
            status_code=400,
            detail="Invalid PO number. Use letters, numbers, - or _.",
        )

    return re.compile(
        re.escape(po_number),
        re.IGNORECASE,
    )


def get_safe_file(root_key: str, relative_path: str) -> Path:
    configured_root = FILE_ROOTS.get(root_key)

    if configured_root is None:
        raise HTTPException(
            status_code=404,
            detail="Unknown file folder.",
        )

    try:
        root = configured_root.resolve(strict=True)
        requested_path = Path(relative_path)

        if requested_path.is_absolute() or requested_path.drive:
            raise HTTPException(
                status_code=404,
                detail="Invalid file path.",
            )

        file_path = (root / requested_path).resolve(strict=True)

        # Prevent access outside the selected root.
        file_path.relative_to(root)

        if not stat.S_ISREG(file_path.stat().st_mode):
            raise HTTPException(
                status_code=404,
                detail="File not found.",
            )

        return file_path

    except (OSError, ValueError, RuntimeError) as error:
        raise HTTPException(
            status_code=404,
            detail="File unavailable or outside the selected folder.",
        ) from error


def get_matching_pdf(
    po_number: str,
    root_key: str,
    relative_path: str,
) -> Path:
    pattern = make_po_pattern(po_number)
    file_path = get_safe_file(root_key, relative_path)

    if (
        file_path.suffix.lower() != ".pdf"
        or not pattern.search(file_path.stem)
    ):
        raise HTTPException(
            status_code=404,
            detail="PDF does not match this PO number.",
        )

    return file_path


def get_created_at(file_stat):
    timestamp = getattr(file_stat, "st_birthtime", None)

    if timestamp is None and os.name == "nt":
        timestamp = file_stat.st_ctime

    if timestamp is None:
        return None

    return datetime.fromtimestamp(
        timestamp,
        tz=timezone.utc,
    ).isoformat()


@router.get("/search")
def search_files(
    po_number: str = Query(..., min_length=1, max_length=100),
):
    po_number = po_number.strip()
    pattern = make_po_pattern(po_number)

    files = []
    warnings = []
    available_roots = 0
    scanned_pdf_count = 0
    matched_pdf_count = 0

    for root_key, configured_root in FILE_ROOTS.items():
        try:
            root = configured_root.resolve(strict=True)

            if not stat.S_ISDIR(root.stat().st_mode):
                warnings.append(
                    f"Not a directory: {configured_root}"
                )
                continue

        except (OSError, ValueError, RuntimeError) as error:
            warnings.append(
                f"Cannot access folder: {configured_root} — {error}"
            )
            continue

        available_roots += 1

        def scan_error(error):
            warnings.append(
                f"Cannot read folder: {error.filename} — {error}"
            )

        for folder, _, filenames in os.walk(
            root,
            followlinks=False,
            onerror=scan_error,
        ):
            for filename in filenames:
                if Path(filename).suffix.lower() != ".pdf":
                    continue

                scanned_pdf_count += 1

                # Search PO number in the PDF filename.
                if not pattern.search(Path(filename).stem):
                    continue

                matched_pdf_count += 1
                source = Path(folder) / filename

                try:
                    relative_path = source.relative_to(root).as_posix()

                    file_path = get_safe_file(
                        root_key,
                        relative_path,
                    )
                    file_stat = file_path.stat()

                except HTTPException as error:
                    warnings.append(
                        f"Cannot read file: {source} — {error.detail}"
                    )
                    continue

                except (OSError, ValueError, RuntimeError) as error:
                    warnings.append(
                        f"Cannot read file: {source} — {error}"
                    )
                    continue

                # A date conversion issue should not hide the PDF.
                try:
                    created_at = get_created_at(file_stat)
                except (OSError, ValueError, OverflowError) as error:
                    created_at = None
                    warnings.append(
                        f"Cannot read creation date: {source} — {error}"
                    )

                subfolder = source.parent.relative_to(root)

                display_folder = (
                    root.name
                    if subfolder == Path(".")
                    else f"{root.name}/{subfolder.as_posix()}"
                )

                url_params = urlencode({
                    "po_number": po_number,
                    "root": root_key,
                    "file": relative_path,
                })

                files.append({
                    "name": filename,
                    "folder": display_folder,
                    "type": get_file_type(root_key, relative_path),
                    "year": get_file_year(root_key, relative_path),
                    "size_bytes": file_stat.st_size,
                    "created_at": created_at,
                    "download_url": (
                        f"/api/v1/po_files/download?{url_params}"
                    ),
                    "preview_url": (
                        f"/api/v1/po_files/preview?{url_params}"
                    ),
                })

    warnings = sorted(set(warnings))

    if available_roots == 0:
        raise HTTPException(
            status_code=503,
            detail=(
                "All file folders are unavailable.\n"
                + "\n".join(warnings)
            ),
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
        "warnings": warnings,
        "diagnostics": {
            "available_roots": available_roots,
            "scanned_pdf_count": scanned_pdf_count,
            "matched_pdf_count": matched_pdf_count,
        },
    }


@router.get("/download")
def download_file(
    po_number: str = Query(..., min_length=1, max_length=100),
    root: str = Query(..., min_length=1, max_length=100),
    file: str = Query(..., min_length=1, max_length=2000),
):
    file_path = get_matching_pdf(po_number, root, file)

    return FileResponse(
        path=file_path,
        filename=file_path.name,
        media_type="application/pdf",
        content_disposition_type="attachment",
    )


@router.get("/preview")
def preview_file(
    po_number: str = Query(..., min_length=1, max_length=100),
    root: str = Query(..., min_length=1, max_length=100),
    file: str = Query(..., min_length=1, max_length=2000),
):
    file_path = get_matching_pdf(po_number, root, file)

    return FileResponse(
        path=file_path,
        filename=file_path.name,
        media_type="application/pdf",
        content_disposition_type="inline",
    )