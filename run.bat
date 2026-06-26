@echo off
cd /d C:\Users\TPSERVER\cnc_project
call venv\Scripts\activate.bat

set ENABLE_SCHEDULER=1

uvicorn main:app --host 0.0.0.0 --port 8000
pause