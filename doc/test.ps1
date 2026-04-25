$InputDir  = "Z:\Topnotch Group\Public\AS9100\Shop Traveler\SHOP TRAVELER\"
$OutputDir = "C:\docs\shop_travelers"

New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null

$files = Get-ChildItem $InputDir -Recurse -Filter *.doc -File |
         Where-Object { $_.Name -match "blank" }

Write-Host "Found files:" $files.Count

foreach ($f in $files) {

    # Write-Host "------------------------------"
    Write-Host "Processing:" $f.FullName

    $relative = $f.DirectoryName.Substring($InputDir.Length).TrimStart('\')
    $targetFolder = Join-Path $OutputDir $relative
    New-Item -ItemType Directory -Path $targetFolder -Force | Out-Null

    $out = Join-Path $targetFolder ($f.BaseName + ".docx")

    if (Test-Path $out) {
        Write-Host "[SKIP]"
        continue
    }

    # 🔥 run conversion in separate PowerShell
    $script = @"
`$word = New-Object -ComObject Word.Application
`$word.Visible = `$false
`$word.DisplayAlerts = 0

try {
    `$doc = `$word.Documents.Open('$($f.FullName)', `$true, `$true)
    `$doc.SaveAs2('$out', 16)
    `$doc.Close()
}
catch {}

`$word.Quit()
"@

    $job = Start-Job -ScriptBlock {
    param($code)
    powershell -NoProfile -Command $code
} -ArgumentList $script

$job | Out-Null   # 🔥 hide job table

# wait max 10 seconds
Wait-Job $job -Timeout 10 | Out-Null

if ($job.State -ne "Completed") {
    Write-Host "[KILLED - FREEZE]" $f.Name
    Stop-Job $job | Out-Null
}
else {
    Write-Host "[OK]"
}

Remove-Job $job | Out-Null
}

Write-Host "DONE"