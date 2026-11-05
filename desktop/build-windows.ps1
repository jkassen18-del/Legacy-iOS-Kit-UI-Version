# Build the Legacy iOS Kit desktop app on Windows.
# Produces:
#   dist\Legacy iOS Kit\                       (one-folder app)
#   dist\LegacyiOSKit-portable-win64.zip       (portable — unzip and run)
#   dist\installer\LegacyiOSKit-Setup.exe      (installer, if Inno Setup present)
#
# Prereqs: Python 3.9+, and (for the installer) Inno Setup 6 (iscc on PATH).
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot

Write-Host "==> Installing build dependencies"
python -m pip install --upgrade pip
python -m pip install -r "$PSScriptRoot\requirements.txt"

Write-Host "==> Building app with PyInstaller"
Push-Location $root
try {
    pyinstaller --noconfirm "desktop\legacy_ios_kit.spec"

    $appDir = "dist\Legacy iOS Kit"
    if (-not (Test-Path $appDir)) { throw "Build output not found: $appDir" }

    Write-Host "==> Creating portable zip"
    $zip = "dist\LegacyiOSKit-portable-win64.zip"
    if (Test-Path $zip) { Remove-Item $zip }
    Compress-Archive -Path "$appDir\*" -DestinationPath $zip
    Write-Host "    $zip"

    Write-Host "==> Building installer (Inno Setup)"
    $iscc = Get-Command iscc -ErrorAction SilentlyContinue
    if ($iscc) {
        & $iscc.Source "desktop\installer\legacy-ios-kit.iss"
        Write-Host "    dist\installer\LegacyiOSKit-Setup.exe"
    } else {
        Write-Warning "iscc (Inno Setup) not found on PATH — skipped installer. Portable zip was still built."
    }
}
finally { Pop-Location }

Write-Host "==> Done."
