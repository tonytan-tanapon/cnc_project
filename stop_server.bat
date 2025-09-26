@echo off
echo === Stopping production listening on TCP :8000 ===

powershell -NoProfile -Command ^
  "$pids = Get-NetTCPConnection -State Listen -LocalPort 8000 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique; " ^
  "if($pids){ foreach($procId in $pids){ try{ " ^
  "  $proc = Get-CimInstance Win32_Process -Filter ('ProcessId=' + $procId); " ^
  "  Write-Host ('Killing PID ' + $procId + '  [' + $proc.Name + ']'); " ^
  "  Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue " ^
  "} catch {} } } else { Write-Host 'No process is listening on 8000.' }"

echo Done.
