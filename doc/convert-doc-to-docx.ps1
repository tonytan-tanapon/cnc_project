$InputDir  = "Z:\Topnotch Group\Public\AS9100\Shop Traveler\SHOP TRAVELER\AF6182\02-1031 NC"
$OutputDir = "C:\docs\shop_travelers"

if (!(Test-Path $InputDir)) {
    Write-Host "Input folder not found: $InputDir"
    exit
}

if (!(Test-Path $OutputDir)) {
    New-Item -ItemType Directory -Path $OutputDir | Out-Null
}

$word = $null

try {
    $word = New-Object -ComObject Word.Application
    $word.Visible = $false
    $word.DisplayAlerts = 0

    $files = Get-ChildItem -Path $InputDir -Recurse -File -Filter *.doc

    $count = 0

    foreach ($file in $files) {
        $count++

        $relativePath = $file.DirectoryName.Substring($InputDir.Length).TrimStart('\')
        $targetFolder = Join-Path $OutputDir $relativePath

        if (!(Test-Path $targetFolder)) {
            New-Item -ItemType Directory -Path $targetFolder -Force | Out-Null
        }

        $outFile = Join-Path $targetFolder ($file.BaseName + ".docx")

        Write-Host "----------------------------------------"
        Write-Host "Converting: $($file.FullName)"

        $doc = $null
        try {
            $doc = $word.Documents.Open($file.FullName)
            $doc.SaveAs($outFile, 16)
            $doc.Close()
            Write-Host "Saved: $outFile"
        }
        catch {
            Write-Host "ERROR converting: $($file.FullName)"
            Write-Host $_.Exception.Message
            if ($doc -ne $null) {
                $doc.Close()
            }
        }
    }

    Write-Host ""
    Write-Host "Total converted: $count"
}
finally {
    if ($word -ne $null) {
        $word.Quit()
    }

    [System.Runtime.Interopservices.Marshal]::ReleaseComObject($word) | Out-Null
    [GC]::Collect()
    [GC]::WaitForPendingFinalizers()
}