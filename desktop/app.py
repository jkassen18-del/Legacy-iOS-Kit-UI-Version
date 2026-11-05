#!/usr/bin/env python3
"""
Legacy iOS Kit — desktop app entry point.

Starts the local GUI server on a free loopback port and shows it in a native
window (via pywebview). If pywebview isn't available, it falls back to opening
the page in the default browser. This same file is the PyInstaller entry point
for the packaged .exe / .app / binary.
"""

import os
import sys
import threading
import webbrowser


def gui_dir():
    """Locate the bundled `gui` package (server.py + static/)."""
    if getattr(sys, "frozen", False):
        return os.path.join(sys._MEIPASS, "gui")           # PyInstaller bundle
    return os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "gui")


def main():
    gdir = os.path.abspath(gui_dir())
    if gdir not in sys.path:
        sys.path.insert(0, gdir)

    import server  # noqa: E402  (path set above)

    host = "127.0.0.1"
    port = server.find_free_port(host)
    httpd = server.make_server(host, port)
    url = "http://%s:%d/" % (host, port)

    t = threading.Thread(target=httpd.serve_forever, daemon=True)
    t.start()

    restore = server.find_restore_sh()
    print("Legacy iOS Kit — %s" % url)
    print("restore.sh: %s" % (restore or "not found (set LIK_RESTORE or place it "
                              "next to the app)"))

    try:
        import webview  # pywebview
    except ImportError:
        webview = None

    try:
        if webview is not None:
            webview.create_window(
                "Legacy iOS Kit", url,
                width=1200, height=820, min_size=(900, 600),
            )
            webview.start()
        else:
            print("pywebview not installed — opening in your browser instead.")
            webbrowser.open(url)
            print("Press Ctrl+C to quit.")
            threading.Event().wait()
    except KeyboardInterrupt:
        pass
    finally:
        try:
            server.MANAGER.stop_all()
        except Exception:
            pass
        httpd.shutdown()
        httpd.server_close()


if __name__ == "__main__":
    main()
