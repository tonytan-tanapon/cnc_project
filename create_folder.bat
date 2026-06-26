@echo off
setlocal

:: ====== Source Folder ======
set "SOURCE=Z:\Topnotch Group\Public\2026"

:: ====== Destination Folder ======
set "DEST=C:\Users\TPSERVER\Desktop\test_create"

:: Copy โครงสร้างโฟลเดอร์อย่างเดียว
robocopy "%SOURCE%" "%DEST%" /E /XF *.*

echo.
echo Folder structure copied successfully.
pause