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


alembic stamp head
alembic upgrade head

7b9ab10e8cdd

install
Clone Ctrl + Shift + P : git: Clone
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
rundev.bat 

Task
/ เอา material ไปใสใน link material จะได้รู้ว่าต้องใช้ตัวไหน 
/ Material Inventory ถ้ากด แล้วเป็นการ create batch ในตารางจะได้ใส่ batch ที่เข้ามาได้
เอา process cuting ไปใส่ใน traveler จะได้รู้ว่าต้องมี process อะไรบ้าง 
แล้วก็ตอน create traverler ถ้ามี part ที่เคย create แล้วให้ copy มาใส่

Part management
มีสรุป part ที่เหลือทั้งหมด
แต่ละแถวโชร์ว่าเหลือเท่าไร