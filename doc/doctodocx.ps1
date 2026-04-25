$InputDir  = "C:\docs\input"
$OutputDir = "C:\docs\shop_travelers"

# Ensure output root exists
if (!(Test-Path $OutputDir)) {
    New-Item -ItemType Directory -Path $OutputDir | Out-Null
}

# Get files (with "blank" in name, case-insensitive)
$files = Get-ChildItem $InputDir -Recurse -Filter *.doc -File |
         Where-Object { $_.Name -match "(?i)blank" }

Write-Host "Found files:" $files.Count

# Create Word COM once
$word = New-Object -ComObject Word.Application
$word.Visible = $false
$word.DisplayAlerts = 0

# Disable macro/security prompts
try { $word.AutomationSecurity = 3 } catch {}

foreach ($f in $files) {

    Write-Host "----------------------------------------"
    Write-Host "Processing:" $f.FullName

    # Skip long paths
    if ($f.FullName.Length -gt 240) {
        Write-Host "❌ Path too long, skipping"
        continue
    }

    # Build relative path
    $relative = $f.DirectoryName.Substring($InputDir.Length).TrimStart('\')
    $targetFolder = Join-Path $OutputDir $relative

    # Create output folder if needed
    if (!(Test-Path $targetFolder)) {
        New-Item -ItemType Directory -Path $targetFolder -Force | Out-Null
    }

    # Output file
    $outFile = Join-Path $targetFolder ($f.BaseName + ".docx")

    # Skip if already exists
    if (Test-Path $outFile) {
        Write-Host "⏭️ Skip existing:" $outFile
        continue
    }

    try {
        # Open document (with repair mode)
        $doc = $word.Documents.Open(
            $f.FullName,   # file path
            $false,        # ConfirmConversions
            $true,         # ReadOnly
            $false,        # AddToRecentFiles
            "", "", $true, "", "", 0, "", $true  # OpenAndRepair
        )

        # Save as DOCX
        $doc.SaveAs2($outFile, 16)

        # Close doc
        $doc.Close()

        Write-Host "✅ Saved:" $outFile
    }
    catch {
        Write-Host "❌ ERROR processing:" $f.FullName
        Write-Host $_.Exception.Message
    }
}

# Cleanup Word
$word.Quit()
[System.Runtime.InteropServices.Marshal]::ReleaseComObject($word) | Out-Null

Write-Host "DONE"