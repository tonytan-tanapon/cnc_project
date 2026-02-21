import os
import shutil
from pypdf import PdfWriter

PO_DIR  = r"Z:\Topnotch Group\Public\Test 2026\PO"
CERT_DIR  = r"Z:\Topnotch Group\Public\Test 2026\Cert"
MERGE_DIR = r"Z:\Topnotch Group\Public\Test 2026\Merge"


TOKEN = "_name_"


def parse_parts(filepath):
    filename = os.path.basename(filepath)

    if TOKEN not in filename:
        return None, None

    left, right = filename.split(TOKEN, 1)
    key, ext = os.path.splitext(right)

    return left, key


def merge_pdf(po_path, cert_path, out_path):
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    writer = PdfWriter()
    writer.append(po_path)
    writer.append(cert_path)

    with open(out_path, "wb") as f:
        writer.write(f)


def copy_pdf(src, out_path):
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    shutil.copy2(src, out_path)


def main():
    po_map = {}
    cert_map = {}

    # collect PO
    for f in os.listdir(PO_DIR):
        if f.lower().endswith(".pdf"):
            full = os.path.join(PO_DIR, f)
            prefix, key = parse_parts(full)
            if key:
                po_map[key] = full

    # collect Cert
    for f in os.listdir(CERT_DIR):
        if f.lower().endswith(".pdf"):
            full = os.path.join(CERT_DIR, f)
            prefix, key = parse_parts(full)
            if key:
                cert_map[key] = (prefix, full)

    all_keys = set(po_map.keys()) | set(cert_map.keys())

    for key in sorted(all_keys):
        po_path = po_map.get(key)
        cert_entry = cert_map.get(key)

        # MATCH → MERGE
        if po_path and cert_entry:
            cert_prefix, cert_path = cert_entry
            out = os.path.join(MERGE_DIR, cert_prefix, f"{key}.pdf")
            merge_pdf(po_path, cert_path, out)
            print("MERGED:", key)

        # PO ONLY → Merge/PO/
        elif po_path:
            out = os.path.join(MERGE_DIR, "PO", f"{key}.pdf")
            copy_pdf(po_path, out)
            print("COPIED PO:", key)

        # CERT ONLY → _cert
        elif cert_entry:
            cert_prefix, cert_path = cert_entry
            out = os.path.join(MERGE_DIR, cert_prefix, f"{key}_cert.pdf")
            copy_pdf(cert_path, out)
            print("COPIED CERT:", key)

    print("\nAll files handled.")


if __name__ == "__main__":
    main()