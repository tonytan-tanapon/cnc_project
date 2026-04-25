Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass

$ScriptRoot = "C:\docs\inspection\scripts"

Get-ChildItem $ScriptRoot -Recurse -Filter *.doc.ps1 | ForEach-Object {

    Write-Host "Running:" $_.FullName

    Start-Process powershell.exe `
        -WindowStyle Hidden `
        -ArgumentList @(
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy", "Bypass",
            "-File", "`"$($_.FullName)`""
        ) `
        -Wait
}

Write-Host "ALL DONE"
