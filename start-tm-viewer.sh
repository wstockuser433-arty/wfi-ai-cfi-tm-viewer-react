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

START_SENDER="${START_SENDER:-true}"
SENDER_PORT="${SENDER_PORT:-/tmp/ttyV0}"
SENDER_RATE="${SENDER_RATE:-1}"

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
# Cleanup
# ══════════════════════════════════════════════════════════════════════
cleanup() {
  echo ""
  log "${BOLD}Shutting down…${RESET}"

  if [[ -n "$SENDER_PID" ]] && kill -0 "$SENDER_PID" 2>/dev/null; then
    log "  Stopping sender…"; kill -TERM "$SENDER_PID" 2>/dev/null || true
    wait "$SENDER_PID" 2>/dev/null || true; ok "sender stopped"
  fi

  if [[ -n "$FRONTEND_PID" ]] && kill -0 "$FRONTEND_PID" 2>/dev/null; then
    log "  Stopping frontend…"; pkill -TERM -P "$FRONTEND_PID" 2>/dev/null || true
    kill -TERM "$FRONTEND_PID" 2>/dev/null || true
    wait "$FRONTEND_PID" 2>/dev/null || true; ok "frontend stopped"
  fi

  if [[ -n "$BACKEND_PID" ]] && kill -0 "$BACKEND_PID" 2>/dev/null; then
    log "  Stopping backend…"; pkill -TERM -P "$BACKEND_PID" 2>/dev/null || true
    kill -TERM "$BACKEND_PID" 2>/dev/null || true
    wait "$BACKEND_PID" 2>/dev/null || true; ok "backend stopped"
  fi

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

if [[ "$START_SENDER" == "true" ]]; then
  log "Starting EBOX sender…"
  cd "$SENDER_DIR"

  if [[ ! -f "$YAML_FILE" ]] || [[ ! -x "./send_ebox_serial.sh" ]]; then
    warn "Sender files missing — sender skipped"
  else
    run_prefixed "sender" ./send_ebox_serial.sh \
      -p "$SENDER_PORT" \
      -n 0 \
      -i "$SENDER_RATE" \
      -y "$YAML_FILE" \
      -v > /dev/null
    SENDER_PID=$!
    ok "sender started (PID $SENDER_PID)"
  fi
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