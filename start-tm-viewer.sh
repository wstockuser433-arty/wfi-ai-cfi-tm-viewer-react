#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════
# start-tm-viewer.sh — One-click startup for WFI-AI-CFI TM Viewer
# ══════════════════════════════════════════════════════════════════════
#
# Assumes:
#   - ebox-pty.service is running (handles socat /tmp/ttyV0/V1)
#   - docker compose has postgres, redis, grafana (with container_name set)
#   - backend/run.py exists
#   - conda env 'scc' is set up
# ══════════════════════════════════════════════════════════════════════

set -euo pipefail
export RELOAD="${RELOAD:-0}"
# ─── Config ──────────────────────────────────────────────────────────
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$REPO_ROOT/backend"
FRONTEND_DIR="$REPO_ROOT/frontend"
SENDER_DIR="$REPO_ROOT/docs/eth-setup-rel"
YAML_FILE="$BACKEND_DIR/app/tm_dictionary/ebox.yaml"

CONDA_ENV="scc"
BACKEND_PORT=8000
FRONTEND_PORT=5173
GRAFANA_PORT=3000

# START_SENDER="${START_SENDER:-true}"
# SENDER_PORT="${SENDER_PORT:-/tmp/ttyV0}"
# SENDER_RATE="${SENDER_RATE:-1}"
# ─── Sender configuration ────────────────────────────────────────────
# Which transport the sender uses. Must match the backend's active
# ingestion sources. One of: serial | udp | tcp | none
# Auto-detected from backend env if not set explicitly.
SENDER_TRANSPORT="${SENDER_TRANSPORT:-auto}"

# Serial
SENDER_SERIAL_PORT="${SENDER_SERIAL_PORT:-/tmp/ttyV0}"
SENDER_SERIAL_BAUD="${SENDER_SERIAL_BAUD:-115200}"

# UDP (must match backend UDP source port)
SENDER_UDP_HOST="${SENDER_UDP_HOST:-127.0.0.1}"
SENDER_UDP_PORT="${SENDER_UDP_PORT:-9200}"

# TCP (must match backend TCP source port)
SENDER_TCP_HOST="${SENDER_TCP_HOST:-127.0.0.1}"
SENDER_TCP_PORT="${SENDER_TCP_PORT:-9100}"

# Shared
SENDER_RATE="${SENDER_RATE:-1}"
SENDER_CARDS="${SENDER_CARDS:-all}"

START_SENDER="${START_SENDER:-true}"

# Colors
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; GRAY='\033[0;90m'; BOLD='\033[1m'; RESET='\033[0m'

# ─── Log ─────────────────────────────────────────────────────────────
LOG_DIR="$REPO_ROOT/logs"
mkdir -p "$LOG_DIR"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
MAIN_LOG="$LOG_DIR/startup-$TIMESTAMP.log"

# ─── PIDs ────────────────────────────────────────────────────────────
BACKEND_PID=""
FRONTEND_PID=""
SENDER_PID=""

# ══════════════════════════════════════════════════════════════════════
# Helpers
# ══════════════════════════════════════════════════════════════════════
log()  { echo -e "${CYAN}[$(date +%H:%M:%S)]${RESET} $*" | tee -a "$MAIN_LOG"; }
ok()   { echo -e "${GREEN}  ✔${RESET} $*" | tee -a "$MAIN_LOG"; }
warn() { echo -e "${YELLOW}  ⚠${RESET} $*" | tee -a "$MAIN_LOG"; }
fail() { echo -e "${RED}  ✖${RESET} $*" | tee -a "$MAIN_LOG"; }

run_prefixed() {
  local name="$1"; shift
  local logfile="$LOG_DIR/$name-$TIMESTAMP.log"
  ("$@" 2>&1 | sed -u "s/^/${GRAY}[${name}]${RESET} /" | tee -a "$logfile") &
  echo $!
}

wait_for_port() {
  local host="$1" port="$2" timeout="${3:-30}" label="${4:-service}"
  local start=$SECONDS
  while ! (echo > "/dev/tcp/$host/$port") 2>/dev/null; do
    if (( SECONDS - start > timeout )); then
      warn "$label not ready on $host:$port after ${timeout}s — continuing anyway"
      return 1
    fi
    sleep 0.5
  done
  ok "$label ready on $host:$port"
}

# ══════════════════════════════════════════════════════════════════════
# Process-tree helpers
# ══════════════════════════════════════════════════════════════════════
#
# The backend runs as `python run.py` which (with --reload) forks:
#   python run.py                 ← reloader supervisor
#   ├── multiprocessing.spawn…    ← the actual server that owns :8000
#   └── multiprocessing.resource_tracker
#
# Killing only the supervisor can race the reloader's re-spawn, and
# killing only the spawn child makes the supervisor spawn a new one.
# We therefore TERM/KILL the whole tree by NAME (patterns), because once
# a process is orphaned to `systemd --user`, its PGID/SID no longer
# match anything we stored.

# PIDs of processes currently matching a pattern (empty = none)
pids_matching() {
  pgrep -f "$1" 2>/dev/null || true
}

# Kill a tree by pattern with graceful escalation.
#   kill_tree <label> <pattern>... [--port N]
kill_tree() {
  local label="$1"; shift
  local port=""
  if [[ "${1:-}" == "--port" ]]; then port="$2"; shift 2; fi

  local patterns=("$@")
  local any=0
  local p

  # 1) Graceful TERM to every matching PID
  for p in "${patterns[@]}"; do
    if pgrep -f "$p" >/dev/null 2>&1; then
      any=1
      pkill -TERM -f "$p" 2>/dev/null || true
    fi
  done
  (( any )) || { [[ -n "$port" ]] && port_free_check "$port" "$label" && return 0; return 0; }

  # 2) Wait up to 5 s for exit
  local i
  for i in {1..10}; do
    local alive=0
    for p in "${patterns[@]}"; do
      pgrep -f "$p" >/dev/null 2>&1 && { alive=1; break; }
    done
    (( alive )) || break
    sleep 0.5
  done

  # 3) Escalate: KILL anything left
  for p in "${patterns[@]}"; do
    if pgrep -f "$p" >/dev/null 2>&1; then
      warn "$label: escalating to SIGKILL for '$p'"
      pkill -KILL -f "$p" 2>/dev/null || true
    fi
  done
  sleep 0.3

  # 4) Verify
  local still=0
  for p in "${patterns[@]}"; do
    pgrep -f "$p" >/dev/null 2>&1 && { still=1; warn "$label: '$p' still alive!"; }
  done
  if (( still == 0 )); then
    ok "$label stopped"
  fi

  # 5) Optional port verification
  [[ -n "$port" ]] && port_free_check "$port" "$label" || true
}

# Prints an OK/warn depending on whether a port is free
port_free_check() {
  local port="$1" label="${2:-port}"
  if (echo > "/dev/tcp/127.0.0.1/$port") 2>/dev/null; then
    warn "$label: port $port STILL in use after kill:"
    ss -ltnp "sport = :$port" 2>/dev/null | sed 's/^/    /' | tee -a "$MAIN_LOG" || true
    warn "Next run WILL fail with EADDRINUSE. Kill manually before retrying."
    return 1
  fi
  ok "$label: port $port free"
  return 0
}

stop_backend() {
  kill_tree "backend" \
    --port "$BACKEND_PORT" \
    'python run.py' \
    'multiprocessing.spawn' \
    'multiprocessing.resource_tracker'
}

stop_frontend() {
  kill_tree "frontend" \
    --port "$FRONTEND_PORT" \
    'vite' \
    'npm run dev' \
    'node .*vite'
}

stop_sender() {
  kill_tree "sender" \
    'send_ebox_serial.sh' \
    'send_ebox_tm-limits-wali.sh' \
    'send_ebox_tm.sh'
}

# ══════════════════════════════════════════════════════════════════════
# Pre-flight: refuse to start if the port is already taken, and reap
# any zombies left by a previous run that crashed / was SIGKILLed / was
# disconnected before cleanup could run.
# ══════════════════════════════════════════════════════════════════════
check_port_free() {
  local port="$1" label="${2:-port}"
  if (echo > "/dev/tcp/127.0.0.1/$port") 2>/dev/null; then
    fail "$label: port $port is already in use:"
    ss -ltnp "sport = :$port" 2>/dev/null | sed 's/^/    /' | tee -a "$MAIN_LOG" || true
    echo -e "  ${GRAY}Kill it with:${RESET}  sudo pkill -KILL -f 'python run.py'" | tee -a "$MAIN_LOG"
    echo -e "  ${GRAY}        or  :${RESET}  sudo pkill -KILL -f 'npm run dev'"   | tee -a "$MAIN_LOG"
    return 1
  fi
  return 0
}

reap_stale() {
  # Only reaps processes that match the exact command lines we launch.
  # Safe to run repeatedly: no-ops when nothing matches.
  local found=0
  if pgrep -f 'python run.py'              >/dev/null 2>&1; then found=1; fi
  if pgrep -f 'multiprocessing.spawn'      >/dev/null 2>&1; then found=1; fi
  if pgrep -f 'send_ebox_serial.sh'        >/dev/null 2>&1; then found=1; fi
  if pgrep -f 'npm run dev'                >/dev/null 2>&1; then found=1; fi
  if pgrep -f 'vite'                       >/dev/null 2>&1; then found=1; fi

  if (( found == 0 )); then
    return 0
  fi

  warn "Found stale process(es) from a previous run — reaping:"
  pgrep -af 'python run.py|multiprocessing.spawn|send_ebox_serial.sh|npm run dev|vite' 2>/dev/null \
    | sed 's/^/    /' | tee -a "$MAIN_LOG" || true

  stop_backend
  stop_frontend
  stop_sender

  # Give the kernel a moment to release sockets
  sleep 1
}

# Load backend/.env into the shell (without clobbering anything already exported)
load_backend_env() {
  local envfile="$BACKEND_DIR/.env"
  [[ -f "$envfile" ]] || return 0
  set -a
  # shellcheck disable=SC1090
  source "$envfile"
  set +a
}

# Decide sender transport from the backend's effective config:
#   serial → SERIAL_ENABLED=true and SERIAL_PORT is set
#   udp    → TM_UDP_PORT is set (backend will listen on it)
#   tcp    → TM_LISTEN_PORT is set (backend will listen on it)
#   none   → none of the above
detect_transport_from_env() {
  if [[ "${SERIAL_ENABLED:-false}" == "true" && -n "${SERIAL_PORT:-}" ]]; then
    echo "serial"; return
  fi
  if [[ -n "${TM_UDP_PORT:-}" ]]; then
    echo "udp"; return
  fi
  if [[ -n "${TM_LISTEN_PORT:-}" ]]; then
    echo "tcp"; return
  fi
  echo "none"
}

# After config block, before reap_stale/check_port_free:
load_backend_env

# Derive sender target values from .env unless explicitly overridden:
: "${SENDER_SERIAL_PORT:=${SERIAL_PORT:-/tmp/ttyV0}}"
: "${SENDER_SERIAL_BAUD:=${SERIAL_BAUD:-115200}}"
: "${SENDER_UDP_PORT:=${TM_UDP_PORT:-9200}}"
: "${SENDER_UDP_HOST:=${TM_LISTEN_HOST:-127.0.0.1}}"
: "${SENDER_TCP_PORT:=${TM_LISTEN_PORT:-9100}}"
: "${SENDER_TCP_HOST:=${TM_LISTEN_HOST:-127.0.0.1}}"

if [[ "$SENDER_TRANSPORT" == "auto" ]]; then
  SENDER_TRANSPORT="$(detect_transport_from_env)"
  log "Auto-detected sender transport: $SENDER_TRANSPORT (from backend/.env)"
  log "  SERIAL_ENABLED=${SERIAL_ENABLED:-<unset>} SERIAL_PORT=${SERIAL_PORT:-<unset>}"
  log "  TM_UDP_PORT=${TM_UDP_PORT:-<unset>} TM_LISTEN_PORT=${TM_LISTEN_PORT:-<unset>}"
  log "  Override: SENDER_TRANSPORT=serial|udp|tcp|none ./start-tm-viewer.sh"
fi

# ══════════════════════════════════════════════════════════════════════
# Cleanup
# ══════════════════════════════════════════════════════════════════════
cleanup() {
  echo ""
  log "${BOLD}Shutting down…${RESET}"

  if [[ -n "$SENDER_PID" ]] && kill -0 "$SENDER_PID" 2>/dev/null; then
    log "  Stopping sender…"
    stop_sender
  fi

  if [[ -n "$FRONTEND_PID" ]] && kill -0 "$FRONTEND_PID" 2>/dev/null; then
    log "  Stopping frontend…"
    stop_frontend
  fi

  if [[ -n "$BACKEND_PID" ]] && kill -0 "$BACKEND_PID" 2>/dev/null; then
    log "  Stopping backend…"
    stop_backend
  fi

  # Belt-and-braces: even if the PIDs above somehow died before we got
  # here, sweep for orphans by name.  No-op if nothing matches.
  stop_backend  >/dev/null 2>&1 || true
  stop_frontend >/dev/null 2>&1 || true
  stop_sender   >/dev/null 2>&1 || true

  log "  Stopping Docker services (postgres, redis, grafana)…"
  (cd "$REPO_ROOT" && docker compose stop postgres redis grafana 2>/dev/null) || true
  ok "Docker services stopped"

  echo ""
  echo -e "${BOLD}${CYAN}═══════════════════════════════════════════════════════════${RESET}"
  echo -e "${BOLD}  Shutdown complete${RESET}"
  echo -e "${CYAN}═══════════════════════════════════════════════════════════${RESET}"
  echo -e "  Main log:      ${GRAY}$MAIN_LOG${RESET}"
  echo -e "  Service logs:  ${GRAY}$LOG_DIR/${RESET}"
  echo -e "  Note:          socat (ebox-pty.service) is left running (systemd manages it)"
  echo -e "${CYAN}═══════════════════════════════════════════════════════════${RESET}"
}

# ─── Pre-flight: reap stale processes & refuse to start on busy ports ─
reap_stale
check_port_free "$BACKEND_PORT"  "backend" || exit 1
check_port_free "$FRONTEND_PORT" "frontend" || exit 1

trap cleanup EXIT INT TERM

# ══════════════════════════════════════════════════════════════════════
# Banner
# ══════════════════════════════════════════════════════════════════════
clear
echo -e "${BOLD}${CYAN}"
echo "  ╔═══════════════════════════════════════════════════════╗"
echo "  ║       WFI-AI-CFI TM Viewer — Startup Sequence        ║"
echo "  ╚═══════════════════════════════════════════════════════╝"
echo -e "${RESET}"

# ══════════════════════════════════════════════════════════════════════
# 1. Docker
# ══════════════════════════════════════════════════════════════════════
log "[1/4] Starting Docker services…"
cd "$REPO_ROOT"
if ! docker compose up -d postgres redis grafana; then
  fail "docker compose failed. Is Docker running?"
  exit 1
fi
ok "postgres, redis, grafana up"

# ⭐ Robust wait — uses compose service name, not container name
log "Waiting for Postgres…"
for i in {1..30}; do
  if docker compose exec -T postgres pg_isready -U tm -d tmdb >/dev/null 2>&1; then
    ok "postgres ready"; break
  fi
  if (( i == 30 )); then fail "postgres never became ready"; exit 1; fi
  sleep 1
done

# ══════════════════════════════════════════════════════════════════════
# 2. socat PTY pair (systemd)
# ══════════════════════════════════════════════════════════════════════
log "[2/4] Verifying socat PTY pair…"
if [[ -e /tmp/ttyV0 ]] && [[ -e /tmp/ttyV1 ]]; then
  ok "PTY pair exists (/tmp/ttyV0 ↔ /tmp/ttyV1)"
else
  fail "/tmp/ttyV0 or /tmp/ttyV1 missing. Is ebox-pty.service running?"
  warn "Run: sudo systemctl start ebox-pty.service"
  exit 1
fi

# ══════════════════════════════════════════════════════════════════════
# 3. Backend
# ══════════════════════════════════════════════════════════════════════
log "[3/4] Starting backend on :$BACKEND_PORT…"
cd "$BACKEND_DIR"

if ! command -v conda >/dev/null 2>&1; then
  fail "conda not found in PATH"; exit 1
fi
# shellcheck disable=SC1091
source "$(conda info --base)/etc/profile.d/conda.sh"
conda activate "$CONDA_ENV"
ok "conda env '$CONDA_ENV' activated"

if [[ ! -f "$BACKEND_DIR/run.py" ]]; then
  fail "run.py not found in $BACKEND_DIR"
  exit 1
fi

run_prefixed "backend" python run.py > /dev/null
BACKEND_PID=$!
wait_for_port 127.0.0.1 "$BACKEND_PORT" 30 "backend" || true

# ══════════════════════════════════════════════════════════════════════
# 4. Frontend + Sender
# ══════════════════════════════════════════════════════════════════════
log "[4/4] Starting frontend on :$FRONTEND_PORT…"
cd "$FRONTEND_DIR"

if [[ ! -d node_modules ]]; then
  warn "node_modules missing — running npm install…"
  npm install > "$LOG_DIR/npm-install-$TIMESTAMP.log" 2>&1
  ok "npm install complete"
fi

run_prefixed "frontend" npm run dev > /dev/null
FRONTEND_PID=$!
wait_for_port 127.0.0.1 "$FRONTEND_PORT" 60 "frontend" || true

# ══════════════════════════════════════════════════════════════════════
# Sender (transport-aware)
# ══════════════════════════════════════════════════════════════════════
start_sender() {
  cd "$SENDER_DIR" || { fail "SENDER_DIR missing: $SENDER_DIR"; return 1; }
  [[ -f "$YAML_FILE" ]] || { warn "YAML not found at $YAML_FILE — sender skipped"; return 1; }

  case "$SENDER_TRANSPORT" in
    serial)
      local s="./send_ebox_serial.sh"
      [[ -x "$s" ]] || { warn "$s not executable — skipped"; return 1; }
      [[ -e "$SENDER_SERIAL_PORT" ]] || { warn "$SENDER_SERIAL_PORT missing — skipped"; return 1; }
      log "Sender: serial → $SENDER_SERIAL_PORT @ $SENDER_SERIAL_BAUD"
      run_prefixed "sender" "$s" \
        -p "$SENDER_SERIAL_PORT" -b "$SENDER_SERIAL_BAUD" \
        -n 0 -i "$SENDER_RATE" -c "$SENDER_CARDS" \
        -y "$YAML_FILE" -v > /dev/null
      ;;

    udp)
      local s="./send_ebox_tm-limits-wali.sh"
      [[ -x "$s" ]] || { warn "$s not executable — skipped"; return 1; }
      log "Sender: udp → $SENDER_UDP_HOST:$SENDER_UDP_PORT"
      run_prefixed "sender" "$s" \
        -H "$SENDER_UDP_HOST" -p "$SENDER_UDP_PORT" \
        -n 0 -i "$SENDER_RATE" -c "$SENDER_CARDS" \
        -y "$YAML_FILE" -v > /dev/null
      ;;

    tcp)
      fail "SENDER_TRANSPORT=tcp but no TCP sender exists yet."
      fail "Add one in $SENDER_DIR or set SENDER_TRANSPORT=udp."
      return 1
      ;;

    none)
      log "Sender disabled (SENDER_TRANSPORT=none)"
      return 0
      ;;

    *) fail "Unknown SENDER_TRANSPORT='$SENDER_TRANSPORT'"; return 1 ;;
  esac

  SENDER_PID=$!

  sleep 1
  local alive=0
  case "$SENDER_TRANSPORT" in
    serial) pgrep -f 'send_ebox_serial.sh' >/dev/null 2>&1 && alive=1 ;;
    udp)    pgrep -f 'send_ebox_tm'        >/dev/null 2>&1 && alive=1 ;;
  esac
  if ! kill -0 "$SENDER_PID" 2>/dev/null || (( alive == 0 )); then
    fail "sender failed to start — see $LOG_DIR/sender-$TIMESTAMP.log"
    return 1
  fi
  ok "sender started (PID $SENDER_PID, transport=$SENDER_TRANSPORT)"
}

if [[ "$START_SENDER" == "true" ]]; then
  start_sender || warn "sender failed to start — continuing anyway (backend/frontend still running)"
else
  log "Sender disabled (START_SENDER=false)"
fi

# ══════════════════════════════════════════════════════════════════════
# Ready
# ══════════════════════════════════════════════════════════════════════
echo ""
echo -e "${BOLD}${GREEN}═══════════════════════════════════════════════════════════${RESET}"
echo -e "${BOLD}${GREEN}  ✔ TM Viewer is up${RESET}"
echo -e "${GREEN}═══════════════════════════════════════════════════════════${RESET}"
echo -e "  Frontend  : ${CYAN}http://localhost:$FRONTEND_PORT${RESET}"
echo -e "  Backend   : ${CYAN}http://localhost:$BACKEND_PORT${RESET}"
echo -e "  Grafana   : ${CYAN}http://localhost:$GRAFANA_PORT${RESET}  (admin / admin)"
echo -e ""
echo -e "  ${YELLOW}Press Ctrl+C to stop everything (socat keeps running)${RESET}"
echo -e "${GREEN}═══════════════════════════════════════════════════════════${RESET}"
echo ""

wait