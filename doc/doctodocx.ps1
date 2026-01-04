$InputDir  = "C:\docs\input2"
$OutputDir = "C:\docs\output"

if (!(Test-Path $OutputDir)) {
    New-Item -ItemType Directory -Path $OutputDir | Out-Null
}

$files = Get-ChildItem $InputDir -Filter *.doc -File
Write-Host "Found files:" $files.Count

foreach ($f in $files) {
    Write-Host "Converting:" $f.Name

    Start-Process powershell.exe `
        -ArgumentList @(
            "-NoProfile",
            "-Command",
@"
`$word = New-Object -ComObject Word.Application
`$word.Visible = `$false
`$word.DisplayAlerts = 0

`$doc = `$word.Documents.Open(
    '$($f.FullName)',
    `$false,
    `$true,
    `$false,
    '', '',
    `$true
)

`$doc.SaveAs2('$OutputDir\$($f.BaseName).docx',16)
`$doc.Close()
`$word.Quit()
"@
        ) `
        -Wait
}

Write-Host "DONE"
