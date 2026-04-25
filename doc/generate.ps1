# ================== CONFIG ==================
$InputRoot   = "Z:\Topnotch Group\Public\AS9100\Shop Traveler\SHOP TRAVELER\"
$OutputRoot  = "C:\docs\shop_travelers\output"     # mirror structure
$OutputRoot2 = "C:\docs\shop_travelers\result"    # flat
$ScriptRoot  = "C:\docs\shop_travelers\scripts"
# ============================================

# ---------- ensure root folders ----------
foreach ($dir in @($OutputRoot, $OutputRoot2, $ScriptRoot)) {
    if (!(Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir | Out-Null
    }
}

# ---------- find all .doc recursively ----------
$docs = Get-ChildItem $InputRoot -Recurse -Filter *.doc -File |
        Where-Object { $_.Name -match "blank" }

foreach ($d in $docs) {

    # ----- relative path from input root -----
    $relativePath = $d.FullName.Substring($InputRoot.Length).TrimStart('\')
    $relativeDir  = Split-Path $relativePath -Parent

    # ----- mirror output folder -----
    $outDir = Join-Path $OutputRoot $relativeDir
    if (!(Test-Path $outDir)) {
        New-Item -ItemType Directory -Path $outDir -Force | Out-Null
    }

    # ----- script folder (mirror input) -----
    $scriptDir = Join-Path $ScriptRoot $relativeDir
    if (!(Test-Path $scriptDir)) {
        New-Item -ItemType Directory -Path $scriptDir -Force | Out-Null
    }

    # ----- output paths -----
    $mirrorDocx = Join-Path $outDir ($d.BaseName + ".docx")

    # flat output (ป้องกันชื่อซ้ำด้วย prefix folder)
    $safePrefix = ($relativeDir -replace '[\\ ]','_')
    if ([string]::IsNullOrWhiteSpace($safePrefix)) {
        $flatDocx = Join-Path $OutputRoot2 ($d.BaseName + ".docx")
    } else {
        $flatDocx = Join-Path $OutputRoot2 ($safePrefix + "_" + $d.BaseName + ".docx")
    }

    # ----- ps1 path -----
    $ps1Path = Join-Path $scriptDir ($d.Name + ".ps1")

    # ---------- ps1 content ----------
    $content = @"
`$word = New-Object -ComObject Word.Application
`$word.Visible = `$false
`$word.DisplayAlerts = 0

try {
    `$doc = `$word.Documents.Open("$($d.FullName)")

    # mirror output
    `$doc.SaveAs("$mirrorDocx", 16)

    # flat output
    `$doc.SaveAs("$flatDocx", 16)

    `$doc.Close()
}
finally {
    `$word.Quit()
    Get-Process WINWORD -ErrorAction SilentlyContinue | Stop-Process -Force
}
"@

    Set-Content -Path $ps1Path -Value $content -Encoding UTF8
    Write-Host "Created PS1:" $ps1Path
}

Write-Host "GENERATE DONE (mirror + flat)"
