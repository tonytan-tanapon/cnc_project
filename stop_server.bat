@echo off
echo === Stopping uvicorn on port 8000 ===

for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8000"') do (
    echo Killing PID %%a
    taskkill /PID %%a /F >nul 2>&1
)

echo (If no PID found, that means server wasn't running.)
echo Done.