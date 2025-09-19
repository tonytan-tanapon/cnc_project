from sqlalchemy import create_engine, text

engine = create_engine("postgresql+psycopg2://postgres:1234@localhost/mydb")
OUTPUT_SQL  = r"C:\Users\TPSERVER\database\lot_import.sql"

with open(OUTPUT_SQL, "r") as f:
    sql = f.read()

with engine.begin() as conn:
    conn.execute(text(sql))

# from sqlalchemy import create_engine, text

# engine = create_engine("postgresql+psycopg2://postgres:1234@localhost/mydb", future=True)
# SQLFILE = r"C:\Users\TPSERVER\database\lot_import.sql"

# with open(SQLFILE, "r", encoding="utf-8") as f:
#     sql_script = f.read()

# # Very naive split (on semicolon)
# statements = [s.strip() for s in sql_script.split(";") if s.strip()]

# with engine.begin() as conn:
#     for i, stmt in enumerate(statements, start=1):
#         print(f"[{i}/{len(statements)}] Running…")
#         conn.exec_driver_sql(stmt)
#         print(f"[{i}/{len(statements)}] ✅ Done")
# print("All finished.")
