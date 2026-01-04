@echo off
echo Running Word conversion...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0doctodocx.ps1"
pause