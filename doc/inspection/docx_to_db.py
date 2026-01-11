from docx import Document
import os, re, sys
from datetime import datetime
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# ---------------- Path Fix ----------------
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

# ---------------- Models ----------------
from models import Part, PartRevision, QAInspectionTemplate, QAInspectionTemplateItem

# ---------------- DB ----------------
DATABASE_URL = "postgresql+psycopg2://postgres:1234@100.88.56.126:5432/mydb"
engine = create_engine(DATABASE_URL, future=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


# =========================================================
# Helpers
# =========================================================

from datetime import datetime

from datetime import datetime

def parse_json_date(date_str: str):
    if not date_str:
        print("⚠️ No date found, using today()")
        return datetime.today()

    try:
        return datetime.strptime(date_str, "%m-%d-%y")
    except ValueError:
        print(f"⚠️ Invalid date format: {date_str} → using today()")
        return datetime.today()

def extract_file_metadata(filename):
    name = os.path.splitext(filename)[0]

    m = re.search(
        r"^([A-Z]{2}\d+)_"          # cus_no เช่น SA8884
        r"([A-Z0-9\-]+)_"           # part (ไม่มี _)
        r"([A-Z])_"                 # rev (ตัวเดียว ไม่มี _)
        r".*?"                      # ข้ามกลาง
        r"Version[_\s]*([A-Z]+)"   # version
        r".*?(\d{2}-\d{2}-\d{2})", # date
        name,
        re.IGNORECASE
    )

    if m:
        return {
            "cus_no": m.group(1),
            "part": m.group(2),
            "rev": m.group(3),
            "version": m.group(4),
            "date": m.group(5)
        }

    # Fallback ถ้าไม่มีคำว่า Version
    fallback = re.search(
        r"^([A-Z]{2}\d+)_([A-Z0-9\-]+)_([A-Z])",
        name,
        re.IGNORECASE
    )

    dates = re.findall(r"\d{2}-\d{2}-\d{2}", name)

    return {
        "cus_no": fallback.group(1) if fallback else "",
        "part": fallback.group(2) if fallback else "",
        "rev": fallback.group(3) if fallback else "",
        "version": "",
        "date": dates[-1] if dates else ""
    }






def is_multi_op_qa_table(rows):
    if len(rows) < 3:
        return False
    h = " ".join(rows[2]).upper()
    return "B/B" in h and "DIMENSIONS" in h and "TQW" in h and "FA" in h


def is_standard_inspection_table(headers):
    h = " ".join(headers).upper()
    return "BUBBLE" in h and "DIMENSION" in h and "OP#" in h


def get_part_and_rev(db, part_no, rev):
    part = db.query(Part).filter(Part.part_no == part_no).first()
    if not part:
        return None, None

    part_rev = None
    if rev:
        part_rev = (
            db.query(PartRevision)
            .filter(PartRevision.part_id == part.id, PartRevision.rev == rev)
            .first()
        )

    return part, part_rev


def handle_template_versioning(db, part_id, rev_id, new_date):
    query = db.query(QAInspectionTemplate).filter(
        QAInspectionTemplate.part_id == part_id
    )

    if rev_id:
        query = query.filter(QAInspectionTemplate.rev_id == rev_id)
    else:
        query = query.filter(QAInspectionTemplate.rev_id.is_(None))

    existing = query.order_by(QAInspectionTemplate.created_at.desc()).all()

    for tpl in existing:
        db_date = tpl.created_at.replace(tzinfo=None)
        if db_date.date() == new_date.date():
            return "exists", None

    if existing:
        latest = existing[0]
        latest_date = latest.created_at.replace(tzinfo=None)

        if new_date < latest_date:
            return "older", latest_date

        for tpl in existing:
            tpl.active = False

    return "new", None





# =========================================================
# DOCX → STRUCTURE
# =========================================================
def find_col(headers, keyword):
    for i, h in enumerate(headers):
        if keyword in h.upper():
            return i
    raise ValueError(f"Column not found: {keyword}")
def parse_docx_to_rows(docx_path):
    doc = Document(docx_path)
    op_map = {}

    for table in doc.tables:
        rows = [[c.text.strip() for c in row.cells] for row in table.rows]
        if not rows:
            continue

        headers = rows[0]

        # -------- Version A (Multi OP) --------
        if is_multi_op_qa_table(rows):
            print("Detected: MULTI OP QA TABLE")

            op_row = rows[1]
            op_blocks = [
                {"op": op_row[2], "start": 0},
                {"op": op_row[7], "start": 5},
                {"op": op_row[12], "start": 10},
            ]

            for block in op_blocks:
                op = block["op"].strip()
                if not op:
                    continue

                op_map.setdefault(op, [])

                for r in rows[3:]:
                    if len(r) < block["start"] + 2:
                        continue

                    bb = r[block["start"]]
                    dim = r[block["start"] + 1]

                    if bb.upper().startswith("NOTE"):
                        continue
                    if not (bb or dim):
                        continue

                    op_map[op].append({"bb": bb, "dimension": dim})

        # -------- Version NC (Standard) --------
        elif is_standard_inspection_table(headers):
            print("Detected: STANDARD INSPECTION TABLE")

            # idx_op = headers.index("Op#") 
            # idx_bb = headers.index("Bubble #")
            # idx_dim = headers.index("Dimensions")
            idx_op  = find_col(headers, "OP")
            idx_bb  = find_col(headers, "BUBBLE")
            idx_dim = find_col(headers, "DIM")

            current_op = None

            for r in rows[1:]:
                if len(r) <= max(idx_op, idx_bb, idx_dim):
                    continue

                op = r[idx_op].strip()
                bb = r[idx_bb].strip()
                dim = r[idx_dim].strip()

                if op:
                    current_op = op
                if not current_op:
                    continue

                op_map.setdefault(current_op, [])

                if bb or dim:
                    op_map[current_op].append({"bb": bb, "dimension": dim})

    return [{"Op#": op, "Bubble": bubbles} for op, bubbles in sorted(op_map.items())]


# =========================================================
# IMPORT DOCX → DB
# =========================================================

def import_docx_to_qc_template(docx_path):
    print("Processing:", docx_path)
    db = SessionLocal()
 
    try:
        meta = extract_file_metadata(os.path.basename(docx_path))
        json_date = parse_json_date(meta["date"])

        part, part_rev = get_part_and_rev(db, meta["part"], meta["rev"])

        # if docx_path == r"C:\Users\TPSERVER\Desktop\ST convert\ins_blank\SA8884_K424-B43082_E_K424-B43082_E_08-11-25_Version_A_Blank_L17145  08-11-25.docx":
        #     print(meta)
        #     print(part, part_rev )
        #     input()

        if not part:
            print(f"⚠️ Part not found, skip file: {docx_path}")
            return

        rev_id = part_rev.id if part_rev else None

        status, latest_date = handle_template_versioning(
            db, part.id, rev_id, json_date
        )

        if status == "exists":
            print("⏭️ Template already exists (same date). Skip.")
            return

        # กำหนด active ตามสถานะ
        is_active = True
        if status == "older":
            print("⚠️ Older template detected. Insert as inactive.")
            is_active = False

        rows = parse_docx_to_rows(docx_path)

        rev_id = part_rev.id if part_rev else None

        template = QAInspectionTemplate(
            part_id=part.id,
            rev_id=rev_id,   # ✅ ปลอดภัย
            name=f'{meta["part"]}_{meta["rev"]}_version_{meta["version"]}',
            created_at=json_date,
            active=is_active
        )


        db.add(template)
        db.flush()

        seq = 1
        for row in rows:
            op = row.get("Op#")   # 👈 ดึง OP จากระดับบน
            for b in row.get("Bubble", []):
               
                bb = b.get("bb")
                dim = b.get("dimension")

                if not bb or "note" in bb.lower():
                    continue

                item = QAInspectionTemplateItem(
                    template_id=template.id,
                    seq=seq,
                    op_no=op,
                    bb_no=bb,
                    dimension=dim
                )
                db.add(item)
                seq += 1

        db.commit()
        print(f"✅ Imported {meta['part']} REV {meta['rev']}")

    except Exception as e:
        db.rollback()
        print(f"❌ ERROR: {e}")
        raise

    finally:
        db.close()


# =========================================================
# RUN
# =========================================================

import os

FOLDER_PATH = r"C:\Users\TPSERVER\Desktop\ST convert\ins_blank"

if __name__ == "__main__":
    i = 0
    for filename in os.listdir(FOLDER_PATH):

        if filename.lower().endswith(".docx"):
            full_path = os.path.join(FOLDER_PATH, filename)

            print("📄 Processing:", full_path)
            import_docx_to_qc_template(full_path)
            i+=1
    print("total:",i)
