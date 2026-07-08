@echo off
call venv\Scripts\activate.bat

set ENABLE_SCHEDULER=0
uvicorn main:app --host 0.0.0.0 --port 9000 --reload
