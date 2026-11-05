#!/usr/bin/env python3
"""
Legacy iOS Kit GUI - local backend.

A zero-dependency (Python 3 standard library only) web server that provides a
desktop front-end for LukeZGD's Legacy iOS Kit (restore.sh).

It:
  * locates restore.sh (vendored beside this GUI, in the parent dir, or fetched),
  * performs best-effort, read-only device detection,
  * launches the real restore.sh in its line-based --old-menu mode, inside a
    pseudo-terminal where one is available (Linux/macOS) or over pipes otherwise
    (so it still runs on Windows under bash/WSL/Git Bash),
  * streams output to the browser over Server-Sent Events and relays input.

Nothing here performs a restore on its own: it only runs the official tool and
shows what it is doing. The HTTP server binds to 127.0.0.1 (localhost) only.

The module is importable: `make_server()` / `serve()` are used by the desktop
wrapper (desktop/app.py); running it directly starts the server and opens a
browser.
"""

import argparse
import base64
import json
import os
import queue
import re
import shutil
import signal
import socket
import struct
import subprocess
import sys
import threading
import time
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

# Unix-only terminal modules — guarded so the module imports on Windows.
try:
    import pty
    import termios
    import fcntl
    import select
    HAS_PTY = True
except ImportError:  # Windows
    HAS_PTY = False

HERE = os.path.dirname(os.path.abspath(__file__))
STATIC = os.path.join(HERE, "static")
IS_WINDOWS = os.name == "nt"


# --------------------------------------------------------------------------- #
# restore.sh discovery
# --------------------------------------------------------------------------- #

def find_restore_sh():
    """Return absolute path to restore.sh, or None."""
    env = os.environ.get("LIK_RESTORE")
    candidates = []
    if env:
        candidates.append(env)
    candidates += [
        os.path.join(HERE, "..", "restore.sh"),
        os.path.join(os.getcwd(), "restore.sh"),
        os.path.join(HERE, "..", "Legacy-iOS-Kit", "restore.sh"),
        os.path.join(HERE, "Legacy-iOS-Kit", "restore.sh"),
        os.path.expanduser("~/Legacy-iOS-Kit/restore.sh"),
    ]
    # When packaged as a desktop app, look next to the executable too.
    if getattr(sys, "frozen", False):
        exe_dir = os.path.dirname(sys.executable)
        candidates += [
            os.path.join(exe_dir, "restore.sh"),
            os.path.join(exe_dir, "Legacy-iOS-Kit", "restore.sh"),
        ]
    for c in candidates:
        if c and os.path.isfile(c):
            return os.path.abspath(c)
    return None


def find_bash():
    """Locate a bash interpreter, including common Windows (Git/WSL) paths."""
    found = shutil.which("bash")
    if found:
        return found
    if IS_WINDOWS:
        for p in (
            r"C:\Program Files\Git\bin\bash.exe",
            r"C:\Program Files\Git\usr\bin\bash.exe",
            r"C:\Windows\System32\bash.exe",  # WSL
        ):
            if os.path.isfile(p):
                return p
    return None


def tool_available(name):
    return shutil.which(name) is not None


# --------------------------------------------------------------------------- #
# Sessions: a running restore.sh process whose I/O is streamed to the browser.
# --------------------------------------------------------------------------- #

class BaseSession:
    """Shared buffer + subscriber fan-out. Subclasses implement process I/O."""
    MAX_BUFFER = 4 * 1024 * 1024

    def __init__(self, restore_path, flags):
        self.restore_path = restore_path
        self.flags = flags
        self.workdir = os.path.dirname(restore_path) or "."
        self.buffer = bytearray()
        self.subscribers = []        # list[queue.Queue]
        self.lock = threading.Lock()
        self.closed = False
        self.exit_code = None
        self.started_at = time.time()

    # ---- fan-out ----
    def _emit(self, data):
        with self.lock:
            self.buffer += data
            if len(self.buffer) > self.MAX_BUFFER:
                del self.buffer[: len(self.buffer) - self.MAX_BUFFER]
            for q in list(self.subscribers):
                try:
                    q.put_nowait(data)
                except queue.Full:
                    pass

    def _finish(self, code):
        self.exit_code = code
        self.closed = True
        with self.lock:
            for q in list(self.subscribers):
                try:
                    q.put_nowait(b"")
                except queue.Full:
                    pass

    def subscribe(self):
        q = queue.Queue(maxsize=2000)
        with self.lock:
            backlog = bytes(self.buffer)
            self.subscribers.append(q)
        return q, backlog

    def unsubscribe(self, q):
        with self.lock:
            if q in self.subscribers:
                self.subscribers.remove(q)

    def _child_env(self):
        env = os.environ.copy()
        env["TERM"] = "xterm-256color"
        env["COLUMNS"] = "140"   # keep bash `select` option text on one line
        env["LINES"] = "40"
        return env

    # ---- interface ----
    def start(self):      raise NotImplementedError
    def write(self, data): raise NotImplementedError
    def resize(self, cols, rows): pass
    def stop(self):       raise NotImplementedError


class PtySession(BaseSession):
    """Runs restore.sh under a pseudo-terminal (Linux/macOS)."""

    def __init__(self, restore_path, flags):
        super().__init__(restore_path, flags)
        self.pid = None
        self.master_fd = None

    def start(self):
        pid, master_fd = pty.fork()
        if pid == 0:  # child
            try:
                os.chdir(self.workdir)
            except OSError:
                pass
            try:
                os.execvpe("bash", ["bash", self.restore_path] + self.flags,
                           self._child_env())
            except Exception as exc:
                sys.stderr.write("exec failed: %s\n" % exc)
            os._exit(127)
        self.pid = pid
        self.master_fd = master_fd
        self._set_winsize(40, 140)
        threading.Thread(target=self._read_loop, daemon=True).start()

    def _set_winsize(self, rows, cols):
        try:
            fcntl.ioctl(self.master_fd, termios.TIOCSWINSZ,
                        struct.pack("HHHH", rows, cols, 0, 0))
        except OSError:
            pass

    def resize(self, cols, rows):
        self._set_winsize(int(rows), int(cols))

    def _read_loop(self):
        while True:
            try:
                r, _, _ = select.select([self.master_fd], [], [], 0.5)
            except (OSError, ValueError):
                break
            if self.master_fd in r:
                try:
                    data = os.read(self.master_fd, 65536)
                except OSError:
                    break
                if not data:
                    break
                self._emit(data)
        code = -1
        try:
            _, status = os.waitpid(self.pid, 0)
            if os.WIFEXITED(status):
                code = os.WEXITSTATUS(status)
            elif os.WIFSIGNALED(status):
                code = -os.WTERMSIG(status)
        except OSError:
            pass
        self._finish(code)

    def write(self, data):
        if self.master_fd is not None and not self.closed:
            try:
                os.write(self.master_fd, data)
            except OSError:
                pass

    def stop(self):
        if self.pid and not self.closed:
            for sig in (signal.SIGTERM, signal.SIGKILL):
                try:
                    os.killpg(os.getpgid(self.pid), sig)
                except (OSError, AttributeError):
                    try:
                        os.kill(self.pid, sig)
                    except OSError:
                        pass
                time.sleep(0.15)
        try:
            if self.master_fd is not None:
                os.close(self.master_fd)
        except OSError:
            pass


class PipeSession(BaseSession):
    """Runs restore.sh over pipes — fallback for Windows (and where no PTY).

    --old-menu is line-based, so the interactive flow works without a TTY.
    Features that strictly need a terminal (sudo prompts, the raw-mode menu)
    are not available here; on Linux/macOS the PTY path is used instead.
    """

    def __init__(self, restore_path, flags):
        super().__init__(restore_path, flags)
        self.proc = None

    def start(self):
        bash = find_bash()
        if not bash:
            msg = ("[Error] bash was not found. Legacy iOS Kit is a bash tool; "
                   "on Windows install Git for Windows or WSL and ensure bash is "
                   "in PATH.\r\n")
            self._emit(msg.encode())
            self._finish(127)
            return
        try:
            self.proc = subprocess.Popen(
                [bash, self.restore_path] + self.flags,
                cwd=self.workdir,
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                bufsize=0,
                env=self._child_env(),
            )
        except OSError as exc:
            self._emit(("[Error] Could not start bash: %s\r\n" % exc).encode())
            self._finish(127)
            return
        threading.Thread(target=self._read_loop, daemon=True).start()

    def _read_loop(self):
        fd = self.proc.stdout.fileno()
        while True:
            try:
                data = os.read(fd, 65536)
            except OSError:
                break
            if not data:
                break
            self._emit(data)
        code = self.proc.wait() if self.proc else -1
        self._finish(code)

    def write(self, data):
        if self.proc and self.proc.poll() is None:
            try:
                self.proc.stdin.write(data)
                self.proc.stdin.flush()
            except OSError:
                pass

    def stop(self):
        if self.proc and self.proc.poll() is None:
            try:
                self.proc.terminate()
                time.sleep(0.2)
                if self.proc.poll() is None:
                    self.proc.kill()
            except OSError:
                pass


def new_session(restore_path, flags):
    cls = PtySession if HAS_PTY else PipeSession
    return cls(restore_path, flags)


class SessionManager:
    def __init__(self):
        self.sessions = {}
        self.counter = 0
        self.lock = threading.Lock()

    def create(self, restore_path, flags):
        with self.lock:
            self.counter += 1
            sid = str(self.counter)
            s = new_session(restore_path, flags)
            self.sessions[sid] = s
        s.start()
        return sid, s

    def get(self, sid):
        return self.sessions.get(sid)

    def stop_all(self):
        for s in list(self.sessions.values()):
            try:
                s.stop()
            except Exception:
                pass


MANAGER = SessionManager()


# --------------------------------------------------------------------------- #
# Device detection (best effort, read-only)
# --------------------------------------------------------------------------- #

def _run(cmd, timeout=6):
    try:
        out = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
        return out.returncode, out.stdout, out.stderr
    except (subprocess.TimeoutExpired, FileNotFoundError, OSError):
        return 1, "", ""


APPLE_USB_MODES = {0x1281: "Recovery", 0x1227: "DFU", 0x1222: "DFU",
                   0x1280: "WTF", 0x1338: "Restore"}


def detect_device():
    info = {
        "mode": "none", "name": None, "product_type": None, "version": None,
        "build": None, "ecid": None, "model": None, "cpid": None,
        "serial": None, "source": None, "raw": "",
        "tools": {
            "ideviceinfo": tool_available("ideviceinfo"),
            "idevice_id": tool_available("idevice_id"),
            "irecovery": tool_available("irecovery"),
            "lsusb": tool_available("lsusb"),
        },
    }

    if info["tools"]["idevice_id"]:
        rc, out, _ = _run(["idevice_id", "-l"])
        udid = out.strip().splitlines()[0].strip() if out.strip() else ""
        if rc == 0 and udid:
            info["mode"] = "Normal"
            info["source"] = "libimobiledevice"
            if info["tools"]["ideviceinfo"]:
                rc2, out2, _ = _run(["ideviceinfo", "-u", udid])
                info["raw"] = out2
                fields = {}
                for line in out2.splitlines():
                    if ":" in line:
                        k, v = line.split(":", 1)
                        fields[k.strip()] = v.strip()
                info["name"] = fields.get("DeviceName")
                info["product_type"] = fields.get("ProductType")
                info["version"] = fields.get("ProductVersion")
                info["build"] = fields.get("BuildVersion")
                info["serial"] = fields.get("SerialNumber")
                ecid = fields.get("UniqueChipID")
                if ecid and ecid.isdigit():
                    info["ecid"] = hex(int(ecid)).upper().replace("0X", "0x")
            return info

    if info["tools"]["irecovery"]:
        rc, out, _ = _run(["irecovery", "-q"])
        if rc == 0 and out.strip():
            info["source"] = "irecovery"
            info["raw"] = out
            fields = {}
            for line in out.splitlines():
                if ":" in line:
                    k, v = line.split(":", 1)
                    fields[k.strip()] = v.strip()
            info["cpid"] = fields.get("CPID")
            info["model"] = fields.get("MODEL")
            info["ecid"] = fields.get("ECID")
            info["product_type"] = fields.get("PRODUCT")
            mode = fields.get("MODE", "")
            info["mode"] = "Recovery" if "Recovery" in mode else (
                "DFU" if "DFU" in mode else (mode or "Recovery"))
            return info

    if info["tools"]["lsusb"]:
        rc, out, _ = _run(["lsusb"])
        if rc == 0:
            for line in out.splitlines():
                m = re.search(r"05ac:([0-9a-fA-F]{4})", line)
                if m:
                    info["source"] = "lsusb"
                    info["raw"] = line
                    info["mode"] = APPLE_USB_MODES.get(int(m.group(1), 16), "Normal")
                    return info
    elif sys.platform == "darwin":
        rc, out, _ = _run(["system_profiler", "SPUSBDataType"], timeout=10)
        if rc == 0 and ("Apple Mobile Device" in out or "Recovery Mode" in out
                        or "DFU Mode" in out):
            info["source"] = "system_profiler"
            info["mode"] = ("DFU" if "DFU Mode" in out else
                            "Recovery" if "Recovery Mode" in out else "Normal")
            return info

    return info


# --------------------------------------------------------------------------- #
# HTTP handler
# --------------------------------------------------------------------------- #

CONTENT_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon",
}


class Handler(BaseHTTPRequestHandler):
    server_version = "LegacyIOSKitGUI/2.0"
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):
        if os.environ.get("LIK_GUI_VERBOSE"):
            sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))

    def _send_json(self, obj, status=200):
        body = json.dumps(obj).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _read_body(self):
        length = int(self.headers.get("Content-Length", 0) or 0)
        if not length:
            return {}
        try:
            return json.loads(self.rfile.read(length).decode("utf-8"))
        except (ValueError, UnicodeDecodeError):
            return {}

    def _serve_static(self, path):
        if path in ("/", ""):
            path = "/index.html"
        safe = os.path.normpath(path).lstrip("/\\")
        full = os.path.join(STATIC, safe)
        if not os.path.abspath(full).startswith(STATIC) or not os.path.isfile(full):
            self.send_error(404, "Not found"); return
        ctype = CONTENT_TYPES.get(os.path.splitext(full)[1], "application/octet-stream")
        try:
            with open(full, "rb") as f:
                data = f.read()
        except OSError:
            self.send_error(404, "Not found"); return
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    # ---- routing ----
    def do_GET(self):
        p = urlparse(self.path)
        if p.path == "/api/env": return self._api_env()
        if p.path == "/api/device": return self._api_device()
        if p.path == "/api/stream":
            return self._api_stream(parse_qs(p.query).get("session", [""])[0])
        return self._serve_static(p.path)

    def do_POST(self):
        p = urlparse(self.path)
        if p.path == "/api/start": return self._api_start()
        if p.path == "/api/input": return self._api_input()
        if p.path == "/api/resize": return self._api_resize()
        if p.path == "/api/stop": return self._api_stop()
        self.send_error(404, "Not found")

    # ---- api ----
    def _api_env(self):
        self._send_json({
            "restore_sh": find_restore_sh(),
            "platform": ("macos" if sys.platform == "darwin" else
                         "windows" if IS_WINDOWS else
                         "linux" if sys.platform.startswith("linux") else sys.platform),
            "has_pty": HAS_PTY,
            "cwd": os.getcwd(), "gui_dir": HERE,
            "tools": {
                "bash": find_bash() is not None,
                "sudo": tool_available("sudo"),
                "git": tool_available("git"),
                "curl": tool_available("curl"),
                "ideviceinfo": tool_available("ideviceinfo"),
                "irecovery": tool_available("irecovery"),
                "lsusb": tool_available("lsusb"),
            },
        })

    def _api_device(self):
        try:
            self._send_json(detect_device())
        except Exception as exc:
            self._send_json({"mode": "none", "error": str(exc)})

    def _api_start(self):
        body = self._read_body()
        restore = find_restore_sh()
        if not restore:
            return self._send_json(
                {"error": "restore.sh not found. Set LIK_RESTORE or place the gui "
                          "folder inside a Legacy iOS Kit checkout."}, status=400)
        flags = body.get("flags", [])
        if not isinstance(flags, list):
            flags = []
        flags = [str(f) for f in flags if isinstance(f, (str, int))]
        if "--old-menu" not in flags:
            flags = ["--old-menu"] + flags
        sid, _ = MANAGER.create(restore, flags)
        return self._send_json({"session": sid, "flags": flags, "restore_sh": restore})

    def _api_input(self):
        body = self._read_body()
        s = MANAGER.get(str(body.get("session", "")))
        if not s:
            return self._send_json({"error": "no such session"}, status=404)
        s.write(str(body.get("data", "")).encode("utf-8", errors="ignore"))
        return self._send_json({"ok": True})

    def _api_resize(self):
        body = self._read_body()
        s = MANAGER.get(str(body.get("session", "")))
        if not s:
            return self._send_json({"error": "no such session"}, status=404)
        s.resize(body.get("cols", 140), body.get("rows", 40))
        return self._send_json({"ok": True})

    def _api_stop(self):
        body = self._read_body()
        s = MANAGER.get(str(body.get("session", "")))
        if not s:
            return self._send_json({"error": "no such session"}, status=404)
        s.stop()
        return self._send_json({"ok": True})

    def _api_stream(self, sid):
        s = MANAGER.get(str(sid))
        if not s:
            self.send_error(404, "no such session"); return
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Connection", "close")
        self.end_headers()
        q, backlog = s.subscribe()

        def send_chunk(data_bytes):
            payload = base64.b64encode(data_bytes).decode("ascii")
            self.wfile.write(("event: out\ndata: %s\n\n" % payload).encode("ascii"))
            self.wfile.flush()

        try:
            if backlog:
                send_chunk(backlog)
            while True:
                try:
                    data = q.get(timeout=5)
                except queue.Empty:
                    self.wfile.write(b": keepalive\n\n"); self.wfile.flush()
                    if s.closed:
                        break
                    continue
                if data == b"" and s.closed:
                    break
                if data:
                    send_chunk(data)
                if s.closed and q.empty():
                    break
            self.wfile.write(("event: closed\ndata: %s\n\n" %
                              json.dumps({"exit_code": s.exit_code})).encode("ascii"))
            self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError, OSError):
            pass
        finally:
            s.unsubscribe(q)


# --------------------------------------------------------------------------- #
# Server factory + entrypoint
# --------------------------------------------------------------------------- #

def find_free_port(host="127.0.0.1"):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind((host, 0))
        return sock.getsockname()[1]


def make_server(host="127.0.0.1", port=0):
    """Create (but do not start) the HTTP server. port=0 picks a free port."""
    httpd = ThreadingHTTPServer((host, port), Handler)
    httpd.daemon_threads = True
    return httpd


def serve(host="127.0.0.1", port=8777, open_browser=True, banner=True):
    httpd = make_server(host, port)
    actual = httpd.server_address[1]
    url = "http://%s:%d/" % ("localhost" if host in ("127.0.0.1", "0.0.0.0") else host, actual)
    if banner:
        restore = find_restore_sh()
        print("=" * 60)
        print("  Legacy iOS Kit")
        print("=" * 60)
        print("  Serving at : %s" % url)
        print("  restore.sh : %s" % (restore or "NOT FOUND (set LIK_RESTORE)"))
        print("  Runner     : %s" % ("pseudo-terminal" if HAS_PTY else "pipes"))
        print("  Press Ctrl+C to stop.")
        print("=" * 60)
    if open_browser:
        threading.Timer(0.8, lambda: webbrowser.open(url)).start()
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down...")
    finally:
        MANAGER.stop_all()
        httpd.server_close()


def main():
    ap = argparse.ArgumentParser(description="Legacy iOS Kit GUI backend")
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=8777)
    ap.add_argument("--no-browser", action="store_true")
    args = ap.parse_args()
    serve(args.host, args.port, open_browser=not args.no_browser)


if __name__ == "__main__":
    main()
