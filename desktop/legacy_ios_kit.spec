# -*- mode: python ; coding: utf-8 -*-
# PyInstaller spec for Legacy iOS Kit (desktop app).
# Build:  pyinstaller desktop/legacy_ios_kit.spec
# Produces a one-folder app named "Legacy iOS Kit" under dist/.

import os
from PyInstaller.utils.hooks import collect_all

SPEC_DIR = os.path.dirname(os.path.abspath(SPEC))
ROOT = os.path.abspath(os.path.join(SPEC_DIR, ".."))
GUI = os.path.join(ROOT, "gui")

# Bundle the server and the static web assets under a `gui/` prefix so the
# frozen app's import path matches the source layout.
datas = [
    (os.path.join(GUI, "server.py"), "gui"),
    (os.path.join(GUI, "static"), os.path.join("gui", "static")),
]

hiddenimports = []
binaries = []
# pywebview pulls in platform-specific backends; let its hooks collect them.
try:
    d, b, h = collect_all("webview")
    datas += d; binaries += b; hiddenimports += h
except Exception:
    pass

# Optional platform icon, if provided in desktop/assets/.
icon = None
for name in ("icon.ico", "icon.icns"):
    p = os.path.join(SPEC_DIR, "assets", name)
    if os.path.isfile(p):
        icon = p
        break

block_cipher = None

a = Analysis(
    [os.path.join(SPEC_DIR, "app.py")],
    pathex=[GUI],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    runtime_hooks=[],
    excludes=["tkinter", "pytest"],
    cipher=block_cipher,
    noarchive=False,
)
pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="Legacy iOS Kit",
    debug=False,
    strip=False,
    upx=False,
    console=False,          # windowed app (no terminal window)
    icon=icon,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=False,
    name="Legacy iOS Kit",
)

# macOS: also wrap into an .app bundle.
app = BUNDLE(
    coll,
    name="Legacy iOS Kit.app",
    icon=icon,
    bundle_identifier="com.legacyioskit.gui",
    info_plist={
        "NSHighResolutionCapable": True,
        "LSApplicationCategoryType": "public.app-category.utilities",
    },
)
