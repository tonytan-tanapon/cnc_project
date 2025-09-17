@echo off
echo === Stopping production (uvicorn --port 8000) ===
set "PROJ=C:\Users\TPSERVER\cnc_project"

powershell -NoProfile -Command ^
  "$proj = [regex]::Escape('%PROJ%');" ^
  "$p = Get-CimInstance Win32_Process | Where-Object { ($_.Name -match '^(python|pythonw)\.exe$') -and ($_.CommandLine -match 'uvicorn') -and ($_.CommandLine -match '--port\s+8000') -and ($_.CommandLine -match $proj) } | Select-Object -ExpandProperty ProcessId -Unique;" ^
  "if($p){ foreach($pid in $p){ $proc = Get-CimInstance Win32_Process -Filter ('ProcessId=' + $pid); Write-Host ('Killing PID ' + $pid + '  [' + $proc.Name + ']  ' + $proc.CommandLine); Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue } } else { Write-Host 'No matching uvicorn found.' }"

echo Done.
