#!/usr/bin/env bash
#
# Legacy iOS Kit GUI launcher.
# Starts the local backend (Python 3, standard library only) and opens the GUI
# in your browser. It locates restore.sh automatically; if it can't find one,
# it offers to clone the official Legacy iOS Kit next to this GUI.
#
set -euo pipefail

GUI_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PORT="${LIK_GUI_PORT:-8777}"
HOST="${LIK_GUI_HOST:-127.0.0.1}"

# --- pick a python3 ---------------------------------------------------------
PY=""
for c in python3 python; do
    if command -v "$c" >/dev/null 2>&1; then PY="$c"; break; fi
done
if [[ -z "$PY" ]]; then
    echo "Error: python3 is required but was not found in PATH." >&2
    exit 1
fi

# --- locate restore.sh ------------------------------------------------------
find_restore() {
    if [[ -n "${LIK_RESTORE:-}" && -f "${LIK_RESTORE:-}" ]]; then echo "$LIK_RESTORE"; return; fi
    for p in \
        "$GUI_DIR/../restore.sh" \
        "$GUI_DIR/Legacy-iOS-Kit/restore.sh" \
        "$PWD/restore.sh" \
        "$HOME/Legacy-iOS-Kit/restore.sh"; do
        [[ -f "$p" ]] && { echo "$p"; return; }
    done
    echo ""
}

RESTORE="$(find_restore)"

if [[ -z "$RESTORE" ]]; then
    echo "Could not find restore.sh (the Legacy iOS Kit script)."
    echo
    if command -v git >/dev/null 2>&1; then
        read -r -p "Clone the official Legacy iOS Kit into '$GUI_DIR/Legacy-iOS-Kit'? [Y/n] " ans
        ans="${ans:-Y}"
        if [[ "$ans" =~ ^[Yy] ]]; then
            git clone --depth 1 https://github.com/LukeZGD/Legacy-iOS-Kit.git \
                "$GUI_DIR/Legacy-iOS-Kit"
            RESTORE="$GUI_DIR/Legacy-iOS-Kit/restore.sh"
        fi
    else
        echo "git is not installed, so it can't be cloned automatically."
    fi
fi

if [[ -z "$RESTORE" ]]; then
    echo
    echo "Starting the GUI anyway. Set LIK_RESTORE=/path/to/restore.sh and press"
    echo "Refresh in the UI once you have a Legacy iOS Kit checkout."
else
    echo "Using restore.sh: $RESTORE"
    export LIK_RESTORE="$RESTORE"
fi

echo
exec "$PY" "$GUI_DIR/server.py" --host "$HOST" --port "$PORT" "$@"
