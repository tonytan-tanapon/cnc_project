@echo off
cd /d "C:\Users\TPSERVER\cnc_project"
call venv\Scripts\activate.bat

echo === Starting server (port 8000) ===
uvicorn main:app --host 0.0.0.0 --port 9000

echo === Server stopped ===
pause