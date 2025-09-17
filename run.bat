@echo on
cd /d C:\Users\Tanapon\Documents\GitHub\cnc
call venv\Scripts\activate.bat
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
pause