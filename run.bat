@echo off
cd /d C:\Users\TPSERVER\dev\cnc_project
call venv\Scripts\activate.bat
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
pause