@echo off
cd /d C:\Users\TPSERVER\cnc_project

echo === Pulling latest code from Git ===
git pull

echo === Restarting server ===
call stop_server.bat
call start_server.bat

echo === Done! ===

