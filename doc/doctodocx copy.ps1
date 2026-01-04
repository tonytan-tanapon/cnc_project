param (
    [string]$InputDir,
    [string]$OutputDir
)

Write-Host "INPUT :" $InputDir
Write-Host "OUTPUT:" $OutputDir
Write-Host ""

# --- ตรวจและสร้าง output folder ---
if (!(Test-Path $OutputDir)) {
    New-Item -ItemType Directory -Path $OutputDir | Out-Null
}

# --- หาไฟล์ .doc ---
$files = Get-ChildItem $InputDir -Filter *.doc

if ($files.Count -eq 0) {
    Write-Host "No .doc files found."
    return
}

# --- เปิด Word ---
$word = New-Object -ComObject Word.Application
$word.Visible = $false
$word.DisplayAlerts = 0        # ปิด dialog ทุกชนิด
$word.AutomationSecurity = 3   # ปิด macro warning

$countOk = 0
$countFail = 0

foreach ($f in $files) {
    Write-Host "Converting:" $f.Name

    $doc = $null
    $pv  = $null

    try {
        # ✅ ลองเปิดแบบปกติก่อน (ไฟล์ clean จะผ่านเร็ว)
        $doc = $word.Documents.Open($f.FullName)
    }
    catch {
        try {
            # 🔁 fallback สำหรับไฟล์จาก email / protected view / เก่า
            $pv  = $word.ProtectedViewWindows.Open($f.FullName)
            $doc = $pv.Edit()
        }
        catch {
            Write-Host "  !! OPEN ERROR:" $_.Exception.Message
            $countFail++
            continue
        }
    }

    try {
        $outPath = Join-Path $OutputDir ($f.BaseName + ".docx")
        $doc.SaveAs2($outPath, 16)   # 16 = docx
        Write-Host "  -> Saved"
        $countOk++
    }
    catch {
        Write-Host "  !! SAVE ERROR:" $_.Exception.Message
        $countFail++
    }
    finally {
        if ($doc) { $doc.Close($false) }
        if ($pv)  { $pv.Close() }
    }
}

# --- ปิด Word ---
$word.Quit()

Write-Host ""
Write-Host "Done."
Write-Host "Success:" $countOk
Write-Host "Failed :" $countFail
