#!/usr/bin/env bash
# send_ebox_serial.sh — Emit EBOX TM packets over a Serial port (RS-422)
#
# This script is identical to send_ebox_tm.sh, but instead of sending
# UDP datagrams to a host, it writes to a character device (serial port
# or socat PTY).
#
# Development Setup (socat):
#   Terminal 1: socat -d -d pty,raw,echo=0,link=/tmp/ttyV0 pty,raw,echo=0,link=/tmp/ttyV1
#   Terminal 2: ./send_ebox_serial.sh -p /tmp/ttyV0 -n 10
#   Backend UI: Configure port to /tmp/ttyV1, baud 115200
#
# Hardware Setup:
#   ./send_ebox_serial.sh -p /dev/ttyUSB0 -n 100
#
# Usage:
#   ./send_ebox_serial.sh -p <serial_port> [options]
#   ./send_ebox_serial.sh -p /tmp/ttyV0 -n 5 -v
#   ./send_ebox_serial.sh -p /dev/ttyUSB0 -y ebox.yaml -n 0

set -euo pipefail

# ══════════════════════════════════════════════════════════════════════════
# Copy the entire Card table, Constants, and Python PY_GEN block from
# send_ebox_tm.sh here. (Lines 54 - 246 in the previous script)
# ══════════════════════════════════════════════════════════════════════════

# ... [PASTE ALL_CARDS, CARD_SUBID, CARD_SVC, etc. HERE] ...
# ... [PASTE OUTER_HEADER_HEX, EBOX_APID, etc. HERE] ...
# ... [PASTE read -r -d '' PY_GEN <<'PY' ... PY HERE] ...

# Format: "CARD_KEY|unit_sub_id|service|subservice|description"
ALL_CARDS=(
  "CAM_ELEC|16|100|1|Camera Electronics Card"
  "CDPM_P_FPGA|32|102|1|FPGA Processing Card"
  "CDPM_P_AI|33|102|2|AI Board"
  "CDPM_P_THCC|34|102|3|Thermal Control Card"
  "CDPM_R_FPGA|48|104|1|FPGA Processing Card (R)"
  "CDPM_R_AI|49|104|2|AI Board (R)"
  "CTPU_P_PWR|64|112|1|Power Card"
  "CTPU_P_PPC|65|112|2|Power Processing Card"
  "CTPU_R_PWR|80|114|1|Power Card (R)"
  "CTPU_R_PPC|81|114|2|Power Processing Card (R)"
  "UNIT_HK|127|127|1|Unit Housekeeping"
)

declare -A CARD_SUBID=()
declare -A CARD_SVC=()
declare -A CARD_SUBSVC=()
declare -A CARD_DESC=()

for entry in "${ALL_CARDS[@]}"; do
  IFS='|' read -r key sub svc subsvc desc <<<"$entry"
  CARD_SUBID[$key]=$sub
  CARD_SVC[$key]=$svc
  CARD_SUBSVC[$key]=$subsvc
  CARD_DESC[$key]=$desc
done

# ══════════════════════════════════════════════════════════════════════════
# Constants from ICD
# ══════════════════════════════════════════════════════════════════════════

OUTER_HEADER_HEX="23232A2A"
OUTER_TRAILER_HEX="2A2A2323"
EBOX_UNIT_ID=$((0x1A))
EBOX_APID=$((0x2B))
EBOX_VERSION=$((0x02))         # binary 010
SEQ_FLAGS_UNSEGMENTED=$((0x03)) # binary 11
MAX_PAYLOAD=237

# ══════════════════════════════════════════════════════════════════════════
# Physical-value generator (used by -y). Python 3, standard library only.
#   check YAML KEY:sub:svc:subsvc ...   validate yaml + selected cards, exit 1 on error
#   gen   YAML KEY SEQ START PAD VERB   print payload hex (+ decoded values if VERB=1)
# ══════════════════════════════════════════════════════════════════════════

read -r -d '' PY_GEN <<'PY' || true
import math, random, re, struct, sys, time, zlib

MAX_PAYLOAD = 237
TYPES = {
    "u8": (">B", 1), "u16": (">H", 2), "u32": (">I", 4), "u64": (">Q", 8),
    "i8": (">b", 1), "i16": (">h", 2), "i32": (">i", 4), "i64": (">q", 8),
    "f32": (">f", 4), "f64": (">d", 8),
}
# Nominal state per enum field (must be a key of that field's enum in the yaml)
NOMINAL_ENUM = {
    "cam_clock_locked": 1, "cam_lvds_locked": 1, "ai_health_status": 0,
    "thcc_control_loop_state": 1, "pwr_overcurrent_fault": 0, "pwr_efuse_state": 1,
    "unit_mode": 2, "unit_active_cdpm": 0, "unit_active_ctpu": 0,
}
# Unitless fields that have neither limits nor an enum
NOMINAL_CONST = {
    "pwr_uv_ov_status": 0, "ppc_fault_flags": 0, "ai_model_id": 1,
    "thcc_thermistor_ok": 1, "unit_last_tc_seq": 0, "unit_obc_time_corr": 0.0,
}
LIMIT_KEYS = ("ltl", "lth", "htl", "hth")


def die(msg):
    sys.stderr.write("Error: %s\n" % msg)
    sys.exit(1)


def num(s):
    try:
        return int(s, 0)
    except ValueError:
        return float(s)


def scalar(s):
    """yaml scalar: "quoted" -> str, number -> int/float, anything else -> str."""
    s = s.strip()
    if s.startswith('"'):
        return s.strip('"')
    try:
        return num(s)
    except ValueError:
        return s


def parse(path):
    """Minimal reader for the flow-style card/field lines used by ebox.yaml."""
    card_re = re.compile(r"^  ([A-Za-z0-9_]+):\s*(#.*)?$")
    attr_re = re.compile(r"^    (unit_sub_id|service|subservice):\s*(\S+)")
    field_re = re.compile(r"^\s+-\s*\{(.*)\}\s*(#.*)?$")
    cards, cur, in_cards = {}, None, False
    try:
        lines = open(path).read().splitlines()
    except OSError as e:
        die("cannot read %s: %s" % (path, e))
    for n, raw in enumerate(lines, 1):
        if raw.startswith("cards:"):
            in_cards = True
            continue
        if not in_cards or not raw.strip() or raw.lstrip().startswith("#"):
            continue
        m = card_re.match(raw)
        if m:
            cur = cards[m.group(1)] = {"fields": []}
            continue
        m = attr_re.match(raw)
        if m and cur is not None:
            cur[m.group(1)] = num(m.group(2))
            continue
        m = field_re.match(raw)
        if m and cur is not None:
            body, f = m.group(1), {}
            em = re.search(r"enum:\s*\{([^}]*)\}", body)
            if em:
                f["enum"] = {int(k): v for k, v in
                             re.findall(r'(\d+)\s*:\s*"([^"]*)"', em.group(1))}
                body = body[:em.start()] + body[em.end():]
            for k, v in re.findall(r'(\w+)\s*:\s*("[^"]*"|[^,]+)', body):
                f[k] = scalar(v)
            for req in ("name", "offset", "type"):
                if req not in f:
                    die("%s line %d: field has no '%s'" % (path, n, req))
            cur["fields"].append(f)
    if not cards:
        die("%s: no cards found under 'cards:'" % path)
    return cards


def band(f):
    """Innermost limit band (lo, hi) of a field, or None when it has no limits."""
    present = [k for k in LIMIT_KEYS if k in f]
    if not present:
        return None
    if "ltl" not in f or "htl" not in f:
        die("field %s: limits need both ltl and htl" % f["name"])
    vals = [f[k] for k in LIMIT_KEYS if k in f]
    if vals != sorted(vals):
        die("field %s: limits are not ascending ltl<=lth<=htl<=hth" % f["name"])
    return (f["lth"] if "lth" in f else f["ltl"]), f["htl"]


def value(key, f, seq, elapsed):
    kind = f["type"]
    name = f["name"]
    if "enum" in f:
        v = NOMINAL_ENUM.get(name, min(f["enum"]))
        if v not in f["enum"]:
            die("field %s: nominal state %r is not in its enum" % (name, v))
        return v
    b = band(f)
    if b:
        lo, hi = b
        mid, half = (lo + hi) / 2.0, (hi - lo) / 2.0
        h = zlib.crc32(("%s:%s" % (key, name)).encode())
        period = 40 + h % 41                       # packets per full swing
        phase = ((h >> 8) % 360) * math.pi / 180.0
        rng = random.Random(zlib.crc32(("%s:%s:%d" % (key, name, seq)).encode()))
        x = 0.40 * math.sin(2 * math.pi * seq / period + phase) + 0.05 * rng.uniform(-1, 1)
        v = min(hi, max(lo, mid + half * x))      # |x| <= 0.45 -> never near an edge
        return v if kind.startswith("f") else int(round(v))
    if name in NOMINAL_CONST:
        v = NOMINAL_CONST[name]
    elif name.endswith("uptime_s"):
        v = elapsed
    elif "ovf" in name or name.endswith("reset_count"):
        v = 0
    elif f.get("unit") == "cnt":
        v = seq // 3 if name.endswith("detections_count") else seq
    else:
        v = 0
    return float(v) if kind.startswith("f") else int(v) % (1 << (8 * TYPES[kind][1]))


def build(key, c, seq, elapsed):
    size = max(f["offset"] + TYPES[f["type"]][1] for f in c["fields"])
    buf, shown, decoded = bytearray(size), [], {}
    for f in c["fields"]:
        fmt, n = TYPES[f["type"]]
        raw = struct.pack(fmt, value(key, f, seq, elapsed))
        buf[f["offset"]:f["offset"] + n] = raw
        back = struct.unpack(fmt, raw)[0]
        decoded[f["name"]] = back
        if "enum" in f:
            txt = "%s=%s" % (f["name"], f["enum"].get(back, back))
        else:
            unit = f.get("unit", "-")
            txt = "%s=%.5g%s" % (f["name"], back, "" if unit in ("-", "") else " " + unit)
        shown.append(txt)
    return bytes(buf), ", ".join(shown), decoded


def validate(cards, selected):
    for key in selected:
        c = cards[key]
        spans = sorted((f["offset"], f["offset"] + TYPES[f["type"]][1], f["name"])
                       for f in c["fields"] if f["type"] in TYPES)
        for f in c["fields"]:
            if f["type"] not in TYPES:
                die("%s.%s: unknown type '%s'" % (key, f["name"], f["type"]))
            band(f)
        for (a0, a1, an), (b0, b1, bn) in zip(spans, spans[1:]):
            if b0 < a1:
                die("%s: fields %s and %s overlap" % (key, an, bn))
        if spans[-1][1] > MAX_PAYLOAD:
            die("%s: fields need %d bytes (max %d)" % (key, spans[-1][1], MAX_PAYLOAD))
        # prove the generated values stay inside their limits
        for seq in range(0, 300):
            _, _, dec = build(key, c, seq, 0)
            for f in c["fields"]:
                b = band(f)
                if b and not (b[0] <= dec[f["name"]] <= b[1]):
                    die("%s.%s=%r left its limits %r at seq %d" % (key, f["name"], dec[f["name"]], b, seq))


cmd, path = sys.argv[1], sys.argv[2]
cards = parse(path)
if cmd == "check":
    sel = []
    for t in sys.argv[3:]:
        key, sub, svc, ss = t.split(":")
        if key not in cards:
            die("card %s is not in %s" % (key, path))
        c = cards[key]
        if (c.get("unit_sub_id"), c.get("service"), c.get("subservice")) != (int(sub), int(svc), int(ss)):
            die("card %s: script has sub=0x%02X svc=0x%02X subsvc=0x%02X but %s has sub=0x%02X svc=0x%02X subsvc=0x%02X"
                % (key, int(sub), int(svc), int(ss), path,
                   c.get("unit_sub_id", 0), c.get("service", 0), c.get("subservice", 0)))
        sel.append(key)
    validate(cards, sorted(set(sel)))
else:
    key, seq, start, pad, verb = sys.argv[3], int(sys.argv[4]), int(sys.argv[5]), sys.argv[6], sys.argv[7]
    payload, text, _ = build(key, cards[key], seq, max(0, int(time.time()) - start))
    if pad == "1":
        payload = payload.ljust(MAX_PAYLOAD, b"\x00")
    print(payload.hex().upper())
    if verb == "1":
        print(text)
PY


# ══════════════════════════════════════════════════════════════════════════
# Defaults
# ══════════════════════════════════════════════════════════════════════════

SERIAL_PORT=""
BAUD=115200
CARDS_ARG="all"
SUB_HDR="fast"
COUNT=10
COUNT_SET=0
INTERVAL=1
GAP=0
DATA="DEADBEEF"
DATA_SET=0
PAYLOAD_FILE=""
YAML_FILE=""
PAD=1
VERBOSE=0
START_EPOCH=$(date +%s)

usage() {
  cat <<EOF
Usage: $0 -p <port> [options]
  -p  serial port (e.g., /dev/ttyUSB0 or /tmp/ttyV0) (required)
  -b  baud rate                                  (default $BAUD)
  -c  cards to send: 'all' or comma-separated
      card names or hex sub IDs                  (default $CARDS_ARG)
  -s  sub-header: 'fast' | 'slow'                (default $SUB_HDR)
  -n  rounds (no -f) or passes through the -f
      file; 0 = forever                          (default $COUNT, or 1 with -f)
  -i  seconds between rounds                     (default $INTERVAL)
  -g  seconds between packets inside a round     (default $GAP)
  -d  source data as hex string                  (default $DATA)
  -f  file of payload hex strings, one per line
  -y  TM dictionary yaml (ebox.yaml)
  -z  with -y: do not zero-pad the payload to 237 bytes
  -v  print each packet as hex
  -l  list the known cards and exit
  -h  this help
EOF
  exit 1
}

# (Copy list_cards() here from send_ebox_tm.sh)
list_cards() {
  printf '%-14s %-6s %-6s %-6s %s\n' "CARD" "SUB_ID" "SVC" "SUBSVC" "DESCRIPTION"
  for entry in "${ALL_CARDS[@]}"; do
    IFS='|' read -r key sub svc subsvc desc <<<"$entry"
    printf '%-14s 0x%02X   0x%02X   0x%02X   %s\n' \
      "$key" "$sub" "$svc" "$subsvc" "$desc"
  done
}

while getopts "p:b:c:s:n:i:g:d:f:y:zvlh" opt; do
  case $opt in
    p) SERIAL_PORT=$OPTARG ;;
    b) BAUD=$OPTARG ;;
    c) CARDS_ARG=$OPTARG ;;
    s) SUB_HDR=$OPTARG ;;
    n) COUNT=$OPTARG; COUNT_SET=1 ;;
    i) INTERVAL=$OPTARG ;;
    g) GAP=$OPTARG ;;
    d) DATA=$OPTARG; DATA_SET=1 ;;
    f) PAYLOAD_FILE=$OPTARG ;;
    y) YAML_FILE=$OPTARG ;;
    z) PAD=0 ;;
    v) VERBOSE=1 ;;
    l) list_cards; exit 0 ;;
    h|*) usage ;;
  esac
done

[[ -z "$SERIAL_PORT" ]] && usage
if [[ ! -e "$SERIAL_PORT" ]]; then
    echo "Error: serial port '$SERIAL_PORT' does not exist." >&2
    exit 1
fi

case "${SUB_HDR,,}" in
  fast) SUB_HDR_BYTE=1 ;;
  slow) SUB_HDR_BYTE=2 ;;
  *) echo "Error: -s must be 'fast' or 'slow'" >&2; exit 1 ;;
esac

# ── Payload list ─────────────────────────────────────────────────────────
PAYLOADS=()        # hex strings, in send order
PAYLOAD_LINES=()   # source line number of each payload (file mode only)

if [[ -n "$YAML_FILE" ]]; then
  (( DATA_SET == 0 )) || { echo "Error: -y and -d cannot be used together" >&2; exit 1; }
  [[ -z "$PAYLOAD_FILE" ]] || { echo "Error: -y and -f cannot be used together" >&2; exit 1; }
  [[ -r "$YAML_FILE" ]] || { echo "Error: cannot read yaml file '$YAML_FILE'" >&2; exit 1; }
  command -v python3 >/dev/null 2>&1 || { echo "Error: -y needs python3" >&2; exit 1; }
  # payloads are generated per card inside send_packet; one placeholder = one round
  PAYLOADS=("")
  PAYLOAD_LINES=(0)
elif [[ -n "$PAYLOAD_FILE" ]]; then
  (( DATA_SET == 0 )) || { echo "Error: -f and -d cannot be used together" >&2; exit 1; }
  [[ -r "$PAYLOAD_FILE" ]] || { echo "Error: cannot read payload file '$PAYLOAD_FILE'" >&2; exit 1; }

  lineno=0
  while IFS= read -r line || [[ -n "$line" ]]; do
    lineno=$(( lineno + 1 ))
    line=${line%%#*}                 # strip comments
    hex=${line//[[:space:]]/}        # strip all whitespace (incl. CR)
    [[ -z "$hex" ]] && continue
    hex=${hex^^}
    if ! [[ "$hex" =~ ^([0-9A-F]{2})+$ ]]; then
      echo "Error: $PAYLOAD_FILE line $lineno: not an even-length hex string" >&2
      exit 1
    fi
    if (( ${#hex} / 2 > MAX_PAYLOAD )); then
      echo "Error: $PAYLOAD_FILE line $lineno: payload is $(( ${#hex} / 2 )) bytes (max $MAX_PAYLOAD)" >&2
      exit 1
    fi
    PAYLOADS+=("$hex")
    PAYLOAD_LINES+=("$lineno")
  done < "$PAYLOAD_FILE"

  (( ${#PAYLOADS[@]} > 0 )) || { echo "Error: no payloads found in '$PAYLOAD_FILE'" >&2; exit 1; }
  # In file mode the default is a single pass through the file
  (( COUNT_SET )) || COUNT=1
else
  DATA=${DATA^^}
  [[ "$DATA" =~ ^([0-9A-F]{2})*$ ]] || { echo "Error: -d must be an even-length hex string" >&2; exit 1; }
  (( ${#DATA} / 2 <= MAX_PAYLOAD )) || { echo "Error: payload too large (max $MAX_PAYLOAD bytes)" >&2; exit 1; }
  PAYLOADS=("$DATA")
  PAYLOAD_LINES=(0)
fi

# Resolve a card token (name or 0xHEX or decimal) into its CARD_KEY
resolve_card() {
  local tok=$1 key
  for key in "${!CARD_SUBID[@]}"; do
    if [[ "$key" == "${tok^^}" ]]; then echo "$key"; return 0; fi
  done
  # try hex or decimal sub_id
  if [[ "$tok" =~ ^0[xX][0-9A-Fa-f]+$ || "$tok" =~ ^(0|[1-9][0-9]*)$ ]]; then
    local n=$(( tok ))
    for key in "${!CARD_SUBID[@]}"; do
      if (( CARD_SUBID[$key] == n )); then echo "$key"; return 0; fi
    done
  fi
  echo "Error: unknown card '$tok' (use -l to list known cards)" >&2
  return 1
}

CARDS=()
IFS=',' read -ra TOKENS <<<"$CARDS_ARG"
for tok in "${TOKENS[@]}"; do
  tok=${tok//[[:space:]]/}
  [[ -z "$tok" ]] && continue
  if [[ "${tok,,}" == "all" ]]; then
    for entry in "${ALL_CARDS[@]}"; do
      IFS='|' read -r key _ _ _ _ <<<"$entry"
      CARDS+=("$key")
    done
  else
    CARDS+=("$(resolve_card "$tok")")
  fi
done
(( ${#CARDS[@]} > 0 )) || { echo "Error: no cards selected" >&2; exit 1; }

# With -y: make sure the yaml and this script agree, and that every generated
# value really stays inside its limits, before a single packet is sent.
if [[ -n "$YAML_FILE" ]]; then
  triples=()
  for card in "${CARDS[@]}"; do
    triples+=("${card}:${CARD_SUBID[$card]}:${CARD_SVC[$card]}:${CARD_SUBSVC[$card]}")
  done
  python3 -I -c "$PY_GEN" check "$YAML_FILE" "${triples[@]}"
fi

# Configure the serial port for raw binary transmission
if ! stty -F "$SERIAL_PORT" "$BAUD" cs8 -cstopb -parenb raw -echo; then
    echo "Error: failed to configure serial port $SERIAL_PORT. Do you have permissions?" >&2
    exit 1
fi

# Open the file descriptor for writing
exec 3>"$SERIAL_PORT"

# ══════════════════════════════════════════════════════════════════════════
# Packet builder (modified to write to FD 3 instead of /dev/udp)
# ══════════════════════════════════════════════════════════════════════════

# (Copy checksum8() here from send_ebox_tm.sh)
checksum8() {
  local hex=$1 sum=0 i byte
  for (( i = 0; i < ${#hex}; i += 2 )); do
    byte=$(( 16#${hex:i:2} ))
    sum=$(( (sum + byte) & 0xFF ))
  done
  printf '%02X' "$sum"
}

declare -A SEQ=()
sent=0
CUR_SRC_LINE=0

send_packet() {
  local card=$1
  local sub_id=${CARD_SUBID[$card]}
  local svc=${CARD_SVC[$card]}
  local subsvc=${CARD_SUBSVC[$card]}
  local seq=${SEQ[$card]:-0}

  local payload=$DATA values=""
  if [[ -n "$YAML_FILE" ]]; then
    local gen
    gen=$(python3 -I -c "$PY_GEN" gen "$YAML_FILE" "$card" "$seq" "$START_EPOCH" "$PAD" "$VERBOSE")
    payload=${gen%%$'\n'*}
    if [[ "$gen" == *$'\n'* ]]; then values=${gen#*$'\n'}; fi
  fi

  local word0=$(( (EBOX_VERSION << 13) | (0 << 12) | (1 << 11) | EBOX_APID ))
  local word1=$(( (SEQ_FLAGS_UNSEGMENTED << 14) | (seq & 0x3FFF) ))
  local sub_hdr_hex=$(printf '%02X' "$SUB_HDR_BYTE")
  local eff_hdr_hex=$(printf '%02X%02X%02X%02X' "$EBOX_UNIT_ID" "$sub_id" "$svc" "$subsvc")

  local body="${sub_hdr_hex}${eff_hdr_hex}${payload}"
  local body_len=$(( ${#body} / 2 ))
  local pkt_data_field_len=$(( body_len + 1 ))
  local length_field=$(( pkt_data_field_len - 1 ))

  local word2_hex=$(printf '%04X' "$length_field")
  local word0_hex=$(printf '%04X' "$word0")
  local word1_hex=$(printf '%04X' "$word1")

  local checksum_area="${word0_hex}${word1_hex}${word2_hex}${body}"
  local cs_hex=$(checksum8 "$checksum_area")

  local inner="${word0_hex}${word1_hex}${word2_hex}${body}${cs_hex}"
  local frame="${OUTER_HEADER_HEX}${inner}${OUTER_TRAILER_HEX}"

  # ══════════════════════════════════════════════════════════════════════
  # WRITE TO SERIAL FD 3
  # ══════════════════════════════════════════════════════════════════════
  printf "$(sed 's/../\\x&/g' <<<"$frame")" >&3

  sent=$(( sent + 1 ))

  if (( VERBOSE )); then
    local frame_bytes=$(( ${#frame} / 2 ))
    local inner_bytes=$(( ${#inner} / 2 ))
    printf '[%d] %-14s  sub=0x%02X svc=0x%02X subsvc=0x%02X  seq=%-5d  ' \
      "$sent" "$card" "$sub_id" "$svc" "$subsvc" "$seq"
    printf 'payload=%d B' "$(( ${#payload} / 2 ))"
    if [[ -n "$PAYLOAD_FILE" ]]; then printf ' (file line %d)' "$CUR_SRC_LINE"; fi
    printf '  inner=%d B, frame=%d B\n' "$inner_bytes" "$frame_bytes"
    printf '        frame: %s\n' "$frame"
    if [[ -n "$values" ]]; then printf '        values: %s\n' "$values"; fi
  fi

  SEQ[$card]=$(( (seq + 1) & 0x3FFF ))
}

# ══════════════════════════════════════════════════════════════════════════
# Main loop (Identical to send_ebox_tm.sh)
# ══════════════════════════════════════════════════════════════════════════

round=0
pass=0
n_payloads=${#PAYLOADS[@]}

while :; do
  pass=$(( pass + 1 ))
  for (( idx = 0; idx < n_payloads; idx++ )); do
    DATA=${PAYLOADS[$idx]}
    CUR_SRC_LINE=${PAYLOAD_LINES[$idx]}

    for card in "${CARDS[@]}"; do
      send_packet "$card"
      if [[ "$GAP" != "0" ]]; then sleep "$GAP"; fi
    done
    round=$(( round + 1 ))

    if (( COUNT > 0 && pass >= COUNT && idx == n_payloads - 1 )); then
      break 2
    fi
    sleep "$INTERVAL"
  done
done

# Close the serial file descriptor
exec 3>&-

if [[ -n "$PAYLOAD_FILE" ]]; then
  echo "Sent $sent EBOX TM packet(s) ($round round(s), $pass pass(es) of ${n_payloads} payload(s) × ${#CARDS[@]} card(s)) to $SERIAL_PORT"
else
  echo "Sent $sent EBOX TM packet(s) ($round round(s) × ${#CARDS[@]} card(s)) to $SERIAL_PORT"
fi