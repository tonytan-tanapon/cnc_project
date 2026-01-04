@echo off
setlocal EnableExtensions EnableDelayedExpansion

set "INPUT_DIR=C:\docs\input"
set "OUTPUT_DIR=C:\docs\output"

if not exist "%OUTPUT_DIR%" mkdir "%OUTPUT_DIR%"

echo INPUT  = %INPUT_DIR%
echo OUTPUT = %OUTPUT_DIR%
echo.

set COUNT=0

for %%F in ("%INPUT_DIR%\*.doc") do (
    set /a COUNT+=1
    echo ----------------------------------------
    echo Converting: %%~nxF

    powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "$word = New-Object -ComObject Word.Application; ^
     $word.Visible = $false; ^
     $doc = $word.Documents.Open('%%F'); ^
     $out = Join-Path '%OUTPUT_DIR%' ('%%~nF.docx'); ^
     $doc.SaveAs($out, 16); ^
     $doc.Close(); ^
     $word.Quit(); ^
     Write-Host 'Saved:' $out"
)

echo.
echo Total converted: %COUNT%
pause
