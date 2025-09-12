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

pip install -r requirements.txt

create Database
sqlacodegen postgresql://postgres:1234@localhost:5432/mydb --outfile models.py

 IPv4 Address. . . . . . . . . . . : 192.168.1.211
 TopEng ............................ 100.73.200.18
 CNC Topcouch 192.168.1.198



alembic revision --autogenerate -m "add users and time_entries tables"
alembic upgrade head

100.76.36.69
tail scale 100.73.200.18
fd7a:115c:a1e0::ef01:2452

Initial Database
Delete all version 
then

alembic revision --autogenerate -m "add tables"
alembic upgrade head

7b9ab10e8cdd

install
Clone Ctrl + Shift + P : git: Clone
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
rundev.bat 