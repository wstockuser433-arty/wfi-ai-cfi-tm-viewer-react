#!/usr/bin/env bash
# Build ONE double-clickable program from script_launcher.py + your shell script(s).
#
#   ./build_app.sh [-o app-name] script.sh [more-scripts.sh ...]
#
# Result: dist/<app-name>   (a single file; copy it to the other PC and double-click it)
#
# Needs, on the machine that BUILDS (not on the machine that runs it):
#   python3 with Tk and pip   (Ubuntu: sudo apt install python3-tk python3-pip)
#   internet access the first time (downloads PyInstaller into ./.build-pkgs)
# A conda/venv python also works if it has tkinter.  PYTHON=/path/to/python overrides.
# Build on the same Ubuntu version (or older) than the PC that will run it.
set -euo pipefail
cd "$(dirname "$0")"

die() { echo "ERROR: $*" >&2; exit 1; }
usage() { sed -n '2,13p' "$0" | sed 's/^# \{0,1\}//'; exit 1; }

NAME=""
while getopts "o:h" opt; do
  case $opt in o) NAME=$OPTARG ;; *) usage ;; esac
done
shift $((OPTIND - 1))
(( $# >= 1 )) || usage
for s in "$@"; do [[ -f $s ]] || die "script not found: $s"; done
[[ -n $NAME ]] || NAME="$(basename "${1%.sh}")-ui"

PYTHON=${PYTHON:-python3}
echo ">> using $("$PYTHON" -c 'import sys; print(sys.executable, sys.version.split()[0])')"
"$PYTHON" -c "import tkinter" 2>/dev/null || die "Python Tk is missing.  Run:  sudo apt install python3-tk"
"$PYTHON" -m pip --version >/dev/null 2>&1 || die "pip is missing.  Run:  sudo apt install python3-pip"

PKGS="$PWD/.build-pkgs"
if [[ ! -d $PKGS/PyInstaller ]]; then
  echo ">> installing PyInstaller into .build-pkgs (first time only)"
  "$PYTHON" -m pip install -q --target "$PKGS" pyinstaller \
    || die "could not install PyInstaller (internet needed the first time)"
fi

mkdir -p build dist
ADD=()
for s in "$@"; do ADD+=(--add-data "$(realpath "$s"):scripts"); done

echo ">> building dist/$NAME"
PYTHONPATH="$PKGS" "$PYTHON" -m PyInstaller --noconfirm --clean --onefile --name "$NAME" "${ADD[@]}" \
  --distpath dist --workpath build/work --specpath build \
  --exclude-module unittest --exclude-module pydoc --exclude-module doctest \
  "$PWD/script_launcher.py" >build/pyinstaller.log 2>&1 \
  || { tail -25 build/pyinstaller.log; die "PyInstaller failed (full log: build/pyinstaller.log)"; }

chmod +x "dist/$NAME"
echo ">> done: $(realpath "dist/$NAME")  ($(du -h "dist/$NAME" | cut -f1))"
echo "   Copy that single file to the other PC. Double-click it (or run ./$NAME)."
