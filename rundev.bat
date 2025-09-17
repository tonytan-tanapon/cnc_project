@echo off
cd /d C:\Users\Tanapon\Documents\GitHub\cnc
call venv\Scripts\activate.bat
uvicorn main:app --host 0.0.0.0 --port 9000 --reload
pause