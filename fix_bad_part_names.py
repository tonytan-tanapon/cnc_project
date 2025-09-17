# fix_bad_part_names.py
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from models import Part
DATABASE_URL = "postgresql+psycopg2://postgres:1234@localhost:5432/mydb"

PLACEHOLDER_NAMES = {"part name.", "part name", "name", "-"}

engine = create_engine(DATABASE_URL)
Session = sessionmaker(bind=engine)
sess = Session()

try:
    bads = (sess.query(Part)
                 .filter(Part.name != None)
                 .all())
    n = 0
    for p in bads:
        if (p.name or "").strip().lower() in PLACEHOLDER_NAMES:
            # ถ้าอยากเคลียร์ให้ว่างไว้ก่อน (เพื่อให้ import รอบหน้าเขียนทับ)
            p.name = None
            n += 1
    sess.commit()
    print(f"Updated {n} parts to NULL name (ready to be corrected on next import).")
except:
    sess.rollback()
    raise
finally:
    sess.close()
