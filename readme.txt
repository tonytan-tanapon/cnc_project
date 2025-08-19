mkdir cnc
cd cnc
python -m venv venv
venv\Scripts\activate 

pip install fastapi uvicorn sqlalchemy psycopg2-binary
pip install qrcode[pil]

uvicorn main:app --reload
uvicorn main:app --host 0.0.0.0 --port 8000 --reload

download & install 
Database postgreSQL: https://www.enterprisedb.com/downloads/postgres-postgresql-downloads
Database GUI:pgAdmin

username: postgres
password: 1234

ีupdate lib
pip freeze > requirements.txt

create Database
sqlacodegen postgresql://postgres:1234@localhost:5432/mydb --outfile models.py

 IPv4 Address. . . . . . . . . . . : 192.168.1.211



alembic revision --autogenerate -m "add users and time_entries tables"
alembic upgrade head