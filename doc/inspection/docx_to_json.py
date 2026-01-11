from docx import Document
import json
import os
import re


# -----------------------------
# Helpers
# -----------------------------

def extract_part_rev(filename):
    m = re.search(r"_(\w+)_([A-Z]{1,3})_", filename)
    if m:
        return m.group(1), m.group(2)
    return "", ""


def is_multi_op_qa_table(rows):
    if len(rows) < 3:
        return False
    h = " ".join(rows[2]).upper()   # ใช้แถว B/B#, DIMENSIONS
    return "B/B" in h and "DIMENSIONS" in h and "TQW" in h and "FA" in h


def is_standard_inspection_table(headers):
    h = " ".join(headers).upper()
    return "BUBBLE" in h and "DIMENSION" in h and "OP#" in h

def extract_file_metadata(filename):
    name = os.path.splitext(filename)[0]

    m = re.search(
        r"(SA\d+)_([A-Z0-9]+)_([A-Z]{1,3}).*Version_([A-Z]+).*?(\d{2}-\d{2}-\d{2})",
        name
    )

    if m:
        return {
            "cus_no": m.group(1),
            "part": m.group(2),
            "rev": m.group(3),
            "version": m.group(4),
            "date": m.group(5)
        }

    return {
        "cus_no": "",
        "part": "",
        "rev": "",
        "version": "",
        "date": ""
    }

# -----------------------------
# Main Extract Function
# -----------------------------

def extract_docx_to_json(docx_path):
    print("Processing:", docx_path)

    doc = Document(docx_path)

    base_dir = os.path.dirname(docx_path)
    base_name = os.path.splitext(os.path.basename(docx_path))[0]
    output_json = os.path.join(base_dir, base_name + ".json")

    meta = extract_file_metadata(os.path.basename(docx_path))

    result = {
        "file": os.path.basename(docx_path),
        "cus_no": meta["cus_no"],
        "part": meta["part"],
        "rev": meta["rev"],
        "version": meta["version"],
        "date": meta["date"],
        "rows": []
    }
    op_map = {}   # { "010": [ {bb, dimension}, ... ] }

    # -----------------------------
    # Read Tables
    # -----------------------------

    for table in doc.tables:
        rows = [[c.text.strip() for c in row.cells] for row in table.rows]
        if not rows:
            continue

        headers = rows[0]

        # ===== TYPE 1: VERSION A (Multi-OP QA Table) =====
        if is_multi_op_qa_table(rows):
            print("Detected: MULTI OP QA TABLE (Version A)")

            # OP numbers อยู่แถวที่ 2
            op_row = rows[1]

            # Block layout:
            # [B/B, DIM, DIM, TQW, FA] x 3
            op_blocks = [
                {"op": op_row[2], "start": 0},
                {"op": op_row[7], "start": 5},
                {"op": op_row[12], "start": 10},
            ]

            for block in op_blocks:
                op = block["op"].strip()
                if not op:
                    continue

                if op not in op_map:
                    op_map[op] = []

                for r in rows[3:]:  # skip header rows
                    if len(r) < block["start"] + 2:
                        continue

                    bb = r[block["start"]]
                    dim = r[block["start"] + 1]

                    # ข้ามแถว Note
                    if bb.upper().startswith("NOTE"):
                        continue

                    if not (bb or dim):
                        continue

                    op_map[op].append({
                        "bb": bb,
                        "dimension": dim
                    })

        # ===== TYPE 2: VERSION NC (Standard Inspection Table) =====
        elif is_standard_inspection_table(headers):
            print("Detected: STANDARD INSPECTION TABLE (Grouped like Version A)")

            idx_op = headers.index("Op#")
            idx_bb = headers.index("Bubble #")
            idx_dim = headers.index("Dimensions")

            current_op = None

            for r in rows[1:]:
                if len(r) <= max(idx_op, idx_bb, idx_dim):
                    continue

                op = r[idx_op].strip()
                bb = r[idx_bb].strip()
                dim = r[idx_dim].strip()

                # ถ้า Op# ว่าง ใช้ค่าเดิม
                if op:
                    current_op = op

                if not current_op:
                    continue

                if current_op not in op_map:
                    op_map[current_op] = []

                if bb or dim:
                    op_map[current_op].append({
                        "bb": bb,
                        "dimension": dim
                    })


    # -----------------------------
    # Convert to Final JSON Format
    # -----------------------------

    for op, bubbles in sorted(op_map.items()):
        result["rows"].append({
            "Op#": op,
            "Bubble": bubbles
        })

    # -----------------------------
    # Save JSON
    # -----------------------------

    with open(output_json, "w", encoding="utf-8") as f:
        json.dump(result, f, indent=2, ensure_ascii=False)

    print(f"✅ Saved: {output_json}")


# -----------------------------
# RUN
# -----------------------------
if __name__ == "__main__":
    extract_docx_to_json(
        "doc/inspection/SA8884_150SG1069_AB_150SG1069_AB__Version_A_L17168  05-21-25.docx"
    )

    extract_docx_to_json(
        "doc/inspection/SA8884_150SG1069_AB_150SG1069_AB_Version_NC_150SG1069 AB  03-07-24 Blank.docx"
    )
