# Legacy iOS Kit — desktop app & packaging

This folder turns the GUI into an installable desktop app with a native window,
and builds distributable binaries: a **portable** build (unzip and run) and a
Windows **installer**.

## Run from source

```bash
pip install -r desktop/requirements.txt   # pywebview for the native window
python3 desktop/app.py
```

`app.py` starts the local server on a free loopback port and opens it in a
native window. Without `pywebview` it falls back to your default browser, so the
app still works — it just opens in a tab.

## Build binaries

| Platform | Command | Output |
|---|---|---|
| Windows | `desktop\build-windows.ps1` | `dist\LegacyiOSKit-portable-win64.zip` and `dist\installer\LegacyiOSKit-Setup.exe` |
| macOS | `bash desktop/build-unix.sh` | `dist/LegacyiOSKit-portable-macos.zip` (contains `Legacy iOS Kit.app`) |
| Linux | `bash desktop/build-unix.sh` | `dist/LegacyiOSKit-portable-linux-<arch>.tar.gz` |

The Windows installer step needs [Inno Setup 6](https://jrsoftware.org/isinfo.php)
(`iscc` on `PATH`); without it the portable zip is still produced.

### Build in CI (recommended)

`.github/workflows/build.yml` builds all three platforms on GitHub's runners and
uploads the artifacts. Push a tag like `v1.0.0` to also publish a GitHub Release
with the binaries attached, or run the workflow manually from the Actions tab.
Building the real Windows `.exe` requires a Windows runner, which CI provides.

## How packaging works

`legacy_ios_kit.spec` (PyInstaller) bundles `app.py` together with the GUI
(`gui/server.py` and `gui/static/`) under a `gui/` prefix, so the frozen app's
import path matches the source layout. The result is a windowed app named
**Legacy iOS Kit** (a `.app` bundle on macOS).

## Important: this needs the Legacy iOS Kit tool

The app is a **front-end**. It runs the real `restore.sh`, which it looks for in
this order: `LIK_RESTORE`, next to the executable, a `Legacy-iOS-Kit` folder next
to the executable, the current directory, and `~/Legacy-iOS-Kit/`.

- **macOS / Linux:** put the app inside (or next to) a Legacy iOS Kit checkout,
  or set `LIK_RESTORE=/path/to/restore.sh`.
- **Windows:** Legacy iOS Kit is a **bash tool with no native Windows support**.
  The app will launch and the UI works, but to actually drive a device you need
  `bash` available (Git for Windows or WSL) and Legacy iOS Kit's own
  dependencies. Real device restores from Windows are a best-effort path — the
  tool officially supports Linux and macOS.
