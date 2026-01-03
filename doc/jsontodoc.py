from docx import Document
from pathlib import Path
import json
import copy
import re


# --------------------------------------------------
# Helper: clone a Word table row (safe)
# --------------------------------------------------
def clone_row(table, row_idx):
    row = table.rows[row_idx]
    new_row = copy.deepcopy(row._tr)
    table._tbl.insert(row_idx + 1, new_row)
    return table.rows[row_idx + 1]


# --------------------------------------------------
# Helper: find row containing specific text
# --------------------------------------------------
def find_row_index(table, keyword):
    for i, row in enumerate(table.rows):
        text = "\n".join(cell.text for cell in row.cells)
        if keyword in text:
            return i
    return None


def find_row_object(table, keyword):
    for row in table.rows:
        text = "\n".join(cell.text for cell in row.cells)
        if keyword in text:
            return row
    return None


# --------------------------------------------------
# MAIN
# --------------------------------------------------
def generate_traveler(template_path, json_path, output_path):

    template_path = Path(template_path)
    json_path = Path(json_path)
    output_path = Path(output_path).resolve()

    output_path.parent.mkdir(parents=True, exist_ok=True)
    if output_path.exists():
        output_path.unlink()

    doc = Document(str(template_path))
    data = json.loads(json_path.read_text(encoding="utf-8"))

    # --------------------------------------------------
    # Find STEP TABLE, M2 row, and {op} template row
    # --------------------------------------------------
    step_table = None
    m2_row_idx = None

    for table in doc.tables:
        for i, row in enumerate(table.rows):
            text = "\n".join(cell.text for cell in row.cells)

            if text.strip().startswith("M2"):
                m2_row_idx = i
                print("Found M2 row at", i)

            if "{op}" in text:
                step_table = table
                print("Found OP template row")

        if step_table and m2_row_idx is not None:
            break

    if step_table is None or m2_row_idx is None:
        raise RuntimeError("Cannot find M2 row or {op} template row")

    # --------------------------------------------------
    # Insert PROCESS steps AFTER M2
    # --------------------------------------------------
    insert_at = m2_row_idx+1
    i=0
    print("Inserting process steps after row", insert_at, "which is M2", m2_row_idx   )
    for step in data["steps"]:
        
        if step.get("step_type") != "process":
            continue

        print(f"Inserting step {step['step_code']} after M2 at row {insert_at}" , m2_row_idx)

        
      
        new_row = clone_row(step_table, m2_row_idx )
        i+=1
        # Column 0 = OP code
        new_row.cells[0].text = step["step_code"]

        # Column 1 = OP name + notes
        new_row.cells[1].text = step["step_name"]
        notes = step.get("notes", "")
        if notes:
            new_row.cells[1].add_paragraph(notes)
        
        insert_at += 1

    # --------------------------------------------------
    # Remove {op} template row SAFELY (no index bug)
    # --------------------------------------------------
    op_row = find_row_object(step_table, "{op}")
    if op_row is not None:
        # step_table._tbl.remove(op_row._tr)
        print("Removed {op} template row")

    # --------------------------------------------------
    # Save output
    # --------------------------------------------------
    doc.save(str(output_path))
    print(f"Shop Traveler created successfully: {output_path}")


# --------------------------------------------------
# CLI
# --------------------------------------------------
if __name__ == "__main__":

    template_path = r"C:\Users\TPSERVER\dev\cnc_project\doc\shop_templete.docx"
    json_path = r"C:\Users\TPSERVER\dev\cnc_project\doc\data.json"
    output_path = r"C:\Users\TPSERVER\dev\cnc_project\doc\output_traveler.docx"

    generate_traveler(template_path, json_path, output_path)
