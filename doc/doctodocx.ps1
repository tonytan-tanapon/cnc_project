$InputDir  = "Z:\Topnotch Group\Public\AS9100\Shop Traveler\SHOP TRAVELER\AF6182\02-1031 NC\02-1013 NC Version NC"
$OutputDir = "C:\docs\shop_travelers"

if (!(Test-Path $OutputDir)) {
    New-Item -ItemType Directory -Path $OutputDir | Out-Null
}

# 🔥 include subfolders
$files = Get-ChildItem $InputDir -Recurse -Filter *.doc -File |
         Where-Object { $_.Name -match "(?i)blank" }
Write-Host "Found files:" $files.Count

foreach ($f in $files) {

    Write-Host "----------------------------------------"
    Write-Host "Converting:" $f.FullName

    # ✅ สร้าง relative path
    $relative = $f.DirectoryName.Substring($InputDir.Length).TrimStart('\')

    # ✅ build output folder
    $targetFolder = Join-Path $OutputDir $relative

    if (!(Test-Path $targetFolder)) {
        New-Item -ItemType Directory -Path $targetFolder -Force | Out-Null
    }

    # ✅ output file
    $outFile = Join-Path $targetFolder ($f.BaseName + ".docx")

    # 🔥 skip ถ้ามีแล้ว (เร็วขึ้นมาก)
    if (Test-Path $outFile) {
        Write-Host "⏭️ Skip:" $outFile
        continue
    }

    Start-Process powershell.exe `
        -ArgumentList @(
            "-NoProfile",
            "-Command",
@"
`$word = New-Object -ComObject Word.Application
`$word.Visible = `$false
`$word.DisplayAlerts = 0

try {
    `$doc = `$word.Documents.Open(
        '$($f.FullName)',
        `$false,
        `$true,
        `$false,
        '', '',
        `$true
    )

    `$doc.SaveAs2('$outFile',16)
    `$doc.Close()

    Write-Host 'Saved:' '$outFile'
}
catch {
    Write-Host '❌ ERROR:' '$($f.FullName)'
}

`$word.Quit()
"@
        ) `
        -Wait
}

Write-Host "DONE"