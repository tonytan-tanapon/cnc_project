# services/traveler_docx.py
from docx import Document
import copy
import re
from pathlib import Path

# ==================================================
# Helpers
# ==================================================

def clone_row(table, row_idx):
    row = table.rows[row_idx]
    new_row = copy.deepcopy(row._tr)
    table._tbl.insert(row_idx + 1, new_row)
    return table.rows[row_idx + 1]


def add_text_with_bold(paragraph, text):
    """
    รองรับ **bold**
    """
    parts = re.split(r"(\*\*.*?\*\*)", text or "")
    for part in parts:
        if part.startswith("**") and part.endswith("**"):
            r = paragraph.add_run(part[2:-2])
            r.bold = True
        else:
            paragraph.add_run(part)


def replace_placeholder_fuzzy(paragraph, placeholder, value):
    if not paragraph.runs:
        return

    full_text = "".join(run.text for run in paragraph.runs)

    pattern = re.escape(placeholder[0])
    for ch in placeholder[1:]:
        pattern += r"\s*" + re.escape(ch)

    if not re.search(pattern, full_text):
        return

    new_text = re.sub(pattern, str(value), full_text)

    for run in paragraph.runs:
        run.text = ""

    paragraph.runs[0].text = new_text


def replace_header(doc, mapping):
    for section in doc.sections:
        header = section.header

        # header paragraphs
        for p in header.paragraphs:
            for k, v in mapping.items():
                replace_placeholder_fuzzy(p, k, v)

        # header tables
        for table in header.tables:
            for row in table.rows:
                for cell in row.cells:
                    for p in cell.paragraphs:
                        for k, v in mapping.items():
                            replace_placeholder_fuzzy(p, k, v)


def replace_body_fuzzy(doc, mapping):
    # body paragraphs
    for p in doc.paragraphs:
        for k, v in mapping.items():
            replace_placeholder_fuzzy(p, k, v)

    # body tables
    for table in doc.tables:
        for row in table.rows:
            for cell in row.cells:
                for p in cell.paragraphs:
                    for k, v in mapping.items():
                        replace_placeholder_fuzzy(p, k, v)


# ==================================================
# MAIN GENERATOR (DB-BASED)
# ==================================================

def generate_traveler_from_db(template_path, data: dict, output_path):
    template_path = Path(template_path)
    output_path = Path(output_path)

    output_path.parent.mkdir(parents=True, exist_ok=True)

    doc = Document(str(template_path))

    # --------------------------------------------------
    # HEADER
    # --------------------------------------------------
    header_map = {
        "{{part}}": data["lot"]["part_no"],
        "{{lot}}": data["lot"]["lot_no"],
        "{{po}}": data["lot"]["po_no"],
        "{{due}}": data["lot"]["due_date"],
        "{{cus}}": data["traveler"]["customer_code"],
        "{{qty}}": data["lot"]["planned_qty"],
        "{{material_detail}}": data["lot"]["material_detail"],
    }

    replace_header(doc, header_map)
    replace_body_fuzzy(doc, header_map)

    # --------------------------------------------------
    # MATERIAL (M1 / M2)
    # --------------------------------------------------
    for step in data["steps"]:
        if step["step_code"] in ("M1", "M2"):
            prefix = step["step_code"]

            mat_map = {
                f"{{{{{prefix}_MATERIAL_SIZE}}}}": step.get("material_size", ""),
                f"{{{{{prefix}_TOTAL_LENGTH}}}}": step.get("total_length", ""),
                f"{{{{{prefix}_SUPPLIER}}}}": step.get("supplier", ""),
                f"{{{{{prefix}_PO}}}}": step.get("po", ""),
                f"{{{{{prefix}_HT}}}}": step.get("ht", ""),
            }

            for table in doc.tables:
                for row in table.rows:
                    for cell in row.cells:
                        for p in cell.paragraphs:
                            for k, v in mat_map.items():
                                replace_placeholder_fuzzy(p, k, v)

    # --------------------------------------------------
    # FIND STEP TABLE + M2 ROW
    # --------------------------------------------------
    step_table = None
    m2_row_idx = None

    for table in doc.tables:
        for i, row in enumerate(table.rows):
            text = "\n".join(cell.text for cell in row.cells)

            if text.strip().startswith("{op}"):
                m2_row_idx = i

            if "{op}" in text:
                step_table = table

        if step_table or m2_row_idx is not None:
            break

    if step_table is None or m2_row_idx is None:
        raise RuntimeError("Cannot find M2 row or {op} template row")

    # --------------------------------------------------
    # INSERT PROCESS STEPS AFTER M2
    # --------------------------------------------------

    
    insert_at = m2_row_idx +1
    print(m2_row_idx,step_table,insert_at )
    for step in data["steps"]:
        if step.get("step_type") != "process":
            continue

        new_row = clone_row(step_table, insert_at)

        # OP code
        new_row.cells[0].text = step["step_code"]

        cell = new_row.cells[1]
        cell.text = ""

        # Step name
        p_name = cell.paragraphs[0]
        add_text_with_bold(p_name, step["step_name"])

        # Notes
        if step.get("notes"):
            p = cell.add_paragraph()
            add_text_with_bold(p, step["notes"])

        insert_at += 1

    # --------------------------------------------------
    # REMOVE {op} TEMPLATE ROW
    # --------------------------------------------------
    # for table in doc.tables:
    #     for row in table.rows:
    #         if "{op}" in "\n".join(c.text for c in row.cells):
    #             table._tbl.remove(row._tr)
    #             break

    # --------------------------------------------------
    # SAVE
    # --------------------------------------------------
    doc.save(str(output_path))
