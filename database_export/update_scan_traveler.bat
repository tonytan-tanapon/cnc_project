@echo off

cd /d C:\Users\TPSERVER\dev\cnc_project

call venv\Scripts\activate.bat

python database_export\get_shop_traveler_for_close.py 

pause