$file = "Z:\Topnotch Group\Public\AS9100\Shop Traveler\SHOP TRAVELER\AF6182\02-1031 NC\02-1031 NC Version A\02-1013 NC Version A  12-14-23 Blank.doc"
$out  = "C:\docs\test.docx"

$file = "Z:\Topnotch Group\Public\AS9100\Shop Traveler\SHOP TRAVELER\AF6182\02-1031 NC\02-1031 NC Version A\02-1013 NC Version A  12-14-23 Blank.doc"
$out2  = "C:\docs\test2.docx"

# ensure output folder exists
New-Item -ItemType Directory -Path (Split-Path $out) -Force | Out-Null

$word = New-Object -ComObject Word.Application
$word.Visible = $true
$word.DisplayAlerts = 0
$word.Options.BackgroundSave = $false

try {
    Write-Host "Opening..."
    $doc = $word.Documents.Open($file, $true, $true)

    Start-Sleep -Milliseconds 300

    Write-Host "Saving..."
    $doc.SaveAs2($out, 16)

    Write-Host "[OK] Saved"

    $doc.Close()


    Write-Host "Opening..."
    $doc = $word.Documents.Open($file, $true, $true)

    Start-Sleep -Milliseconds 300

    Write-Host "Saving..."
    $doc.SaveAs2($out2, 16)

    Write-Host "[OK] Saved"

    $doc.Close()
}
catch {
    Write-Host "[ERROR]"
    Write-Host $_.Exception.Message
}

$word.Quit()

# cleanup
[System.Runtime.Interopservices.Marshal]::ReleaseComObject($doc) | Out-Null
[System.Runtime.Interopservices.Marshal]::ReleaseComObject($word) | Out-Null