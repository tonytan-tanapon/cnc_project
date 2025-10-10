@echo off
cd /d "C:\Users\User\Documents\GitHub\cnc_project"
call venv\Scripts\activate.bat

echo === Starting server (port 8000) ===
uvicorn main:app --host 0.0.0.0 --port 8000

echo === Server stopped ===
pause