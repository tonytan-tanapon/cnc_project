# utils/sequencer.py
from datetime import date
from sqlalchemy import text, select
from sqlalchemy.orm import Session
from models import DocCounter

def next_code_yearly(db: Session, prefix: str) -> str:
    """ออกเลขแบบ atomic ต่อปี: <PREFIX>-<YYYY><seq:04d>"""
    year = (date.today().year)%100
    dialect = db.bind.dialect.name

    if dialect == "postgresql":
        # One-liner atomic ด้วย upsert + returning
        seq = db.execute(
            text("""
            INSERT INTO doc_counters (doc_type, year, seq)
            VALUES (:t, :y, 1)
            ON CONFLICT (doc_type, year)
            DO UPDATE SET seq = doc_counters.seq + 1
            RETURNING seq
            """),
            {"t": prefix, "y": year},
        ).scalar_one()
    else:
        # ทางเลือก generic: lock แถว (ต้องรองรับ FOR UPDATE; SQLite ไม่มีจริง)
        # ถ้าใช้ SQLite dev: ยอมรับว่าไม่กัน race เต็มร้อย หรือหุ้มด้วย serialize pragma
        q = (
            select(DocCounter)
            .where(DocCounter.doc_type == prefix, DocCounter.year == year)
            .with_for_update()
        )
        row = db.execute(q).scalar_one_or_none()
        if row is None:
            row = DocCounter(doc_type=prefix, year=year, seq=1)
            db.add(row)
            db.flush()
        else:
            row.seq += 1
            db.flush()
        seq = row.seq

    return f"{prefix}{year}{seq:04d}"
