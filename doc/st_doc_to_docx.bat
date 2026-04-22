@echo off
setlocal EnableExtensions EnableDelayedExpansion

set "INPUT_DIR=Z:\Topnotch Group\Public\AS9100\Shop Traveler\SHOP TRAVELER\AF6182\02-1031 NC"
set "OUTPUT_DIR=C:\docs\shop_travelers"

if not exist "%OUTPUT_DIR%" mkdir "%OUTPUT_DIR%"

echo INPUT  = %INPUT_DIR%
echo OUTPUT = %OUTPUT_DIR%
echo.

set COUNT=0

:: 🔥 เปิด Word ครั้งเดียว
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
"$word = New-Object -ComObject Word.Application; ^
 $word.Visible = $false; ^
 $ErrorActionPreference = 'Continue'; ^

Get-ChildItem -Path '%INPUT_DIR%' -Recurse -Filter *.doc | ForEach-Object { ^
    $in = $_.FullName; ^
    $rel = $in.Substring('%INPUT_DIR%'.Length); ^
    $outDir = Join-Path '%OUTPUT_DIR%' (Split-Path $rel); ^
    if (!(Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir | Out-Null }; ^
    $out = Join-Path $outDir ($_.BaseName + '.docx'); ^

    Write-Host 'Converting:' $in; ^

    try { ^
        $doc = $word.Documents.Open($in); ^
        $doc.SaveAs($out, 16); ^
        $doc.Close(); ^
        Write-Host 'Saved:' $out; ^
    } catch { ^
        Write-Host '❌ ERROR:' $in; ^
    } ^
}; ^

$word.Quit(); ^
Write-Host 'DONE';"

pause