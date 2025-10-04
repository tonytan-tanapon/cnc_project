import csv
import glob
from sqlalchemy import create_engine, Table, MetaData
from sqlalchemy.dialects.postgresql import insert
# Your DB URL
DATABASE_URL = "postgresql+psycopg2://postgres:1234@localhost:5432/mydb"

# Path pattern for CSVs (can be one file or many)
CSV_GLOB = "C:/Users/TPSERVER/backup/test/*.csv"   # change to your folder

import csv
import glob
import os
from sqlalchemy import create_engine, Table, MetaData
from sqlalchemy.dialects.postgresql import insert

# DB URL
DATABASE_URL = "postgresql+psycopg2://postgres:1234@localhost:5432/mydb"

# Folder pattern for CSVs
CSV_GLOB = "C:/Users/TPSERVER/backup/test/*.csv"

def get_table_name_from_file(filename: str) -> str:
    """
    Example: 'time_leaves_202510031002.csv' -> 'time_leaves'
    """
    base = os.path.basename(filename)          # time_leaves_202510031002.csv
    noext = os.path.splitext(base)[0]          # time_leaves_202510031002
    parts = noext.split("_")
    # remove the last part if it looks like a timestamp (all digits and long)
    if parts and parts[-1].isdigit() and len(parts[-1]) > 6:
        parts = parts[:-1]
    return "_".join(parts)

def import_csv_to_table(csv_file: str):
    print(str)
    engine = create_engine(DATABASE_URL, future=True)
    metadata = MetaData()

    table_name = get_table_name_from_file(csv_file)
    print(f"📂 Importing {csv_file} into table: {table_name}")

    table = Table(table_name, metadata, autoload_with=engine)

    with engine.begin() as conn, open(csv_file, newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        valid_cols = set(table.c.keys())  # only DB table columns

        for row in reader:
            values = {
                k: (v.strip() if v and v.strip() != "" else None)
                for k, v in row.items()
                if k in valid_cols
            }
            if not values:
                continue

            stmt = insert(table).values(values)
            # assume "id" is PK, adjust if needed
            if "id" in valid_cols:
                stmt = stmt.on_conflict_do_update(
                    index_elements=["id"],
                    set_={c: stmt.excluded[c] for c in values if c != "id"}
                )
            conn.execute(stmt)

    print(f"✅ Done: {csv_file}")

def main():
    for file in glob.glob(CSV_GLOB):
        import_csv_to_table(file)

if __name__ == "__main__":
    main()