import pandas as pd
from sqlalchemy import create_engine, inspect
from datetime import datetime
from pathlib import Path
def database_backup():
    # ---------------- CONFIG ----------------
    DATABASE_URL = "postgresql+psycopg2://postgres:1234@100.88.56.126:5432/mydb"
    SCHEMA = "public"
    BASE_DIR = Path(r"C:\Users\TPSERVER\backup")
    BASE_DIR2 = Path(r"Z:\Topnotch Group\Public\Testing APP\database_backup")
    # ---------------------------------------

    # Folder format: YYYYMMDDHHMM
    FOLDER_NAME = datetime.now().strftime("%Y%m%d%H%M")
    OUTPUT_DIR = BASE_DIR / FOLDER_NAME
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    OUTPUT_DIR2 = BASE_DIR2 / FOLDER_NAME
    OUTPUT_DIR2.mkdir(parents=True, exist_ok=True)

    engine = create_engine(DATABASE_URL)
    inspector = inspect(engine)
    tables = inspector.get_table_names(schema=SCHEMA)

    with engine.connect() as conn:
        for table in tables:
            print(f"Backing up {table}")
            df = pd.read_sql(f'SELECT * FROM "{SCHEMA}"."{table}"', conn)
            df.to_csv(OUTPUT_DIR / f"{table}.csv", index=False)
            df.to_csv(OUTPUT_DIR2 / f"{table}.csv", index=False)

    print(f"✅ Backup completed → {OUTPUT_DIR}")
    print(f"✅ Backup completed → {OUTPUT_DIR2}")
