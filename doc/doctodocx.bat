@echo off

set INPUT_DIR=C:\docs\input2
set OUTPUT_DIR=C:\docs\output

powershell -NoProfile -ExecutionPolicy Bypass ^
  -File "%~dp0doctodocx.ps1" ^
  -InputDir "%INPUT_DIR%" ^
  -OutputDir "%OUTPUT_DIR%"

pause
