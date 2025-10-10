@echo off
cd /d "C:\Users\User\Documents\GitHub\cnc_project"

echo === Pulling latest code from Git ===
git pull

echo === Restarting server ===
call stop_server_sub.bat

:: รอจนกว่าพอร์ต 8000 จะว่าง (กัน error 10048)
powershell -NoProfile -Command "while(Get-NetTCPConnection -State Listen -LocalPort 8000 -ErrorAction SilentlyContinue){ Start-Sleep -Milliseconds 200 }"

call start_server_sub.bat
