#!/usr/bin/env bash
# Build the Legacy iOS Kit desktop app on Linux or macOS.
# Produces a one-folder app under dist/ plus a portable archive:
#   Linux: dist/LegacyiOSKit-portable-linux-x86_64.tar.gz
#   macOS: dist/LegacyiOSKit-portable-macos.zip  (contains "Legacy iOS Kit.app")
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "==> Installing build dependencies"
python3 -m pip install --upgrade pip
python3 -m pip install -r desktop/requirements.txt

echo "==> Building app with PyInstaller"
pyinstaller --noconfirm desktop/legacy_ios_kit.spec

if [[ "$(uname)" == "Darwin" ]]; then
    echo "==> Packaging macOS app"
    cd dist
    if [[ -d "Legacy iOS Kit.app" ]]; then
        zip -qr "LegacyiOSKit-portable-macos.zip" "Legacy iOS Kit.app"
        echo "    dist/LegacyiOSKit-portable-macos.zip"
    else
        zip -qr "LegacyiOSKit-portable-macos.zip" "Legacy iOS Kit"
    fi
else
    echo "==> Packaging Linux app"
    cd dist
    arch="$(uname -m)"
    tar -czf "LegacyiOSKit-portable-linux-${arch}.tar.gz" "Legacy iOS Kit"
    echo "    dist/LegacyiOSKit-portable-linux-${arch}.tar.gz"
fi

echo "==> Done."
