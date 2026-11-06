#!/usr/bin/env bash
# send_ebox_tm.sh — Emit EBOX TM packets over UDP (WFI-AI-CFI RS-422 ICD v1.2)
#
# Wire layout (all big-endian):
#
#   ┌─ OUTER FRAME ───────────────────────────────────────────────────┐
#   │  Header  (4 B): 23 23 2A 2A                                     │
#   │  ┌─ CCSDS-STYLE PACKET ───────────────────────────────────────┐ │
#   │  │  Main header (6 B):                                        │ │
#   │  │    word0 (2 B): version(3)=010 | type(1)=0 TM              │ │
#   │  │                 sub-hdr flag(1)=1 | APID(11)=0x2B          │ │
#   │  │    word1 (2 B): seq flags(2)=11 | seq count(14)            │ │
#   │  │    word2 (2 B): packet data length - 1 (16)                │ │
#   │  │  Sub-header (1 B): 01 = Fast TM, 02 = Slow TM              │ │
#   │  │  Effective data:                                           │ │
#   │  │    Byte 0: Unit ID      (fixed 0x1A)                       │ │
#   │  │    Byte 1: Unit Sub ID  (module ID, 0x10–0x80)             │ │
#   │  │    Byte 2: Service Type (0x64–0x80)                        │ │
#   │  │    Byte 3: Sub-Service  (0x01–0x80)                        │ │
#   │  │    Byte 4..N: payload (up to 237 B)                        │ │
#   │  │  Checksum (1 B): (sum of main hdr + sub-hdr + eff data)    │ │
#   │  │                  & 0xFF                                    │ │
#   │  └────────────────────────────────────────────────────────────┘ │
#   │  Trailer (4 B): 2A 2A 23 23                                     │
#   └─────────────────────────────────────────────────────────────────┘
#
# The unit_sub_id + service + sub_service triple is the discriminator
# (the APID is fixed for the entire EBOX at 0x2B).
#
# Payload sources (use at most one of -d / -f / -y):
#   -d HEX   one fixed payload, repeated every round        (default DEADBEEF)
#   -f FILE  payloads read from a text file, one hex string per line.
#            Blank lines and '#' comments are ignored; whitespace inside a
#            line is ignored. Each line is one ROUND: that payload is sent to
#            every selected card, then the script moves to the next line.
#            When the end of the file is reached that is one PASS.
#            With -f, -n counts PASSES (default 1); -n 0 = loop the file forever.
#   -y YAML  physical-value mode. The payload of every card is built from the
#            field list in the TM dictionary (ebox.yaml): each field is
#            written at its `offset` as its `type` (big-endian, ICD Table 1)
#            with a realistic value that stays INSIDE its limits:
#              * fields with limits   : slow smooth drift around the middle of
#                                       the innermost band (lth..htl when
#                                       lth is defined, else ltl..htl), never
#                                       closer than 5 % of the half-range to
#                                       an edge
#              * enum fields          : a nominal state (LOCKED, UP, OK, ON,
#                                       NOMINAL, IMAGING, PRIMARY, ...)
#              * counters             : follow the packet sequence; overflow /
#                                       watchdog-reset counters stay 0
#              * *_uptime_s           : seconds since the script started
#              * other unitless flags : 0 (fault flags), ai_model_id=1,
#                                       thcc_thermistor_ok=1
#            The payload is zero-padded to the ICD's fixed 237 bytes (use -z
#            to send only the bytes the yaml defines). With -v the decoded
#            values are printed under each frame. -n counts rounds, as with -d.
#            The (sub id, service, sub-service) triple of every selected card
#            is checked against the yaml at start-up.
#
# Usage:
#   ./send_ebox_tm.sh -H <host> [options]
#   ./send_ebox_tm.sh -H 127.0.0.1 -n 5 -v
#   ./send_ebox_tm.sh -H 127.0.0.1 -c CAM_ELEC -d DEADBEEF -n 20
#   ./send_ebox_tm.sh -H 127.0.0.1 -f ebox_payloads.txt -c CAM_ELEC -v     # one pass
#   ./send_ebox_tm.sh -H 127.0.0.1 -f ebox_payloads.txt -n 0               # forever
#   ./send_ebox_tm.sh -H 127.0.0.1 -y ebox.yaml -n 0 -v                    # physical values
#   ./send_ebox_tm.sh -l            # list all cards
#
# Options:
#   -H  destination host/IP                (required)
#   -p  UDP port                           (default 9200)
#   -c  cards to send: 'all', or a comma-separated list of
#       card names (CAM_ELEC, CDPM_P_AI, ...) or hex sub IDs (0x10)
#   -s  sub-header: 'fast' | 'slow'         (default fast)
#   -n  rounds (no -f) or file passes (-f), 0 = forever
#                                           (default 10 without -f, 1 with -f)
#   -i  seconds between rounds             (default 1)
#   -g  seconds between packets in a round (default 0)
#   -d  source data as hex string          (default DEADBEEF)
#   -f  file of payload hex strings, one per line
#   -y  TM dictionary yaml: build payloads with in-limit physical values
#   -z  with -y: do not pad the payload to 237 bytes
#   -v  print each packet as hex
#   -l  list known cards and exit
#   -h  this help

set -euo pipefail

# ══════════════════════════════════════════════════════════════════════════
# Card table — must match backend/app/tm_dictionary/ebox.yaml
# (with -y this is verified at start-up for every selected card)
# ══════════════════════════════════════════════════════════════════════════

# Format: "CARD_KEY|unit_sub_id|service|subservice|description"
ALL_CARDS=(
  "CAMERA_UNIT_STATUS|16|104|1|Camera Unit Status Telemetry"
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
MAX_PAYLOAD=238

# ══════════════════════════════════════════════════════════════════════════
# Physical-value generator (used by -y). Python 3, standard library only.
#   check YAML KEY:sub:svc:subsvc ...   validate yaml + selected cards, exit 1 on error
#   gen   YAML KEY SEQ START PAD VERB   print payload hex (+ decoded values if VERB=1)
# ══════════════════════════════════════════════════════════════════════════

read -r -d '' PY_GEN <<'PY' || true
import math, random, re, struct, sys, time, zlib

MAX_PAYLOAD = 238
TYPES = {
    "u8": (">B", 1), "u16": (">H", 2), "u32": (">I", 4), "u64": (">Q", 8),
    "u24": (None, 3),
    "i8": (">b", 1), "i16": (">h", 2), "i32": (">i", 4), "i64": (">q", 8),
    "f32": (">f", 4), "f64": (">d", 8),
}

# ─── Realistic raw-value ranges ─────────────────────────────────────
# For fields that have a calc formula in ebox.yaml, we don't generate
# the raw value from "in-limits" of the raw itself (which has no limits),
# we generate it to produce a realistic physical value after calc.
#
# Each entry: field_name → (raw_min, raw_max)
# The generator picks a value in this range, smoothly drifting.
REALISTIC_RAW_VALUES = {
    # NTC thermistors (raw ADC → NTC formula → °C)
    # Raw ~2000-2600 → R ~10k → ~20-30 °C at room temp
    "ntc_primary_ch1_raw": (2100, 2400),
    "ntc_primary_ch2_raw": (2050, 2350),
    "ntc_primary_ch3_raw": (2000, 2300),
    "ntc_primary_ch4_raw": (1950, 2250),
    "ntc_primary_ch5_raw": (2100, 2450),
    "ntc_primary_ch6_raw": (1900, 2200),
    "ntc_primary_ch7_raw": (2050, 2350),
    "ntc_backup_ch1_raw":  (2100, 2400),
    "ntc_backup_ch2_raw":  (2050, 2350),
    "ntc_backup_ch3_raw":  (2000, 2300),
    "ntc_backup_ch4_raw":  (1950, 2250),
    "ntc_backup_ch5_raw":  (2100, 2450),
    "ntc_backup_ch6_raw":  (1900, 2200),
    "ntc_backup_ch7_raw":  (2050, 2350),

    # Power conversion chip temperature
    # Calc: T = 326.85 - D/4095 * 2500
    # Want T ≈ 40-50 °C  →  D ≈ (326.85 - 45) * 4095 / 2500 ≈ 461
    "power_conv_chip_temp_raw": (380, 520),

    # MCU currents (raw ADC → 2.5*(D/4095*5 - 2.445) → A)
    # Want ~1-3 A  →  D/4095*5 ≈ 2.9-3.65 → D ≈ 2400-3000
    "mcu_primary_current_raw":  (2300, 2800),
    "mcu_backup_current_raw":   (2200, 2650),
    "imaging_module_current_raw": (2000, 2500),
    "ai_module_current_raw":    (1800, 2300),

    # LTM8051 temp (sign-magnitude, want ~25 °C → D ≈ 400)
    "ltm8051_temp_raw": (350, 500),

    # DDR / M2S090 (want ~40 °C → D ≈ 640)
    "ddr_memory_temp_raw": (580, 700),
    "m2s090_temp_raw":     (600, 720),

    # Imaging module temperatures
    "img_mod1_channel_temp_raw": (3200, 3700),   # /128 → 25-29 °C
    "img_mod2_channel_temp_raw": (3200, 3700),
    "img_mod1_fpga_temp_raw":    (4500, 5200),   # realistic FPGA die
    "img_mod2_fpga_temp_raw":    (4500, 5200),

    # Voltages (D/4095*5 → V)
    # Want ~28 V  →  D ≈ 22932 — wait, D is u16, max 65535, ok
    # Actually for 28 V: D = 28/5 * 4095 = 22932
    "mcu_primary_volt_raw":     (22500, 23500),
    "mcu_backup_volt_raw":      (22500, 23500),
    "imaging_primary_volt_raw": (22500, 23500),
    "imaging_backup_volt_raw":  (22500, 23500),
    "ai_volt_raw":              (22500, 23500),

    # Reference voltages (want ~2.5 V → D ≈ 2048)
    "mcu_primary_ref_volt_raw":  (2000, 2100),
    "mcu_backup_ref_volt_raw":   (2000, 2100),
    "imaging_ref_volt_raw":      (2000, 2100),
    "ai_ref_volt_raw":           (2000, 2100),

    # Counters that should climb
    "img_mod1_cmd_rx_count":  (0, 50),
    "img_mod2_cmd_rx_count":  (0, 50),
    "cmd_rx_count":           (0, 255),
    "sat_time_broadcast_rx_count": (0, 255),
    "gnc_broadcast_rx_count": (0, 255),
    "arm_start_count":        (0, 5),

    "img_mod1_gps_sec": (1700000000, 1800000000),  # Unix timestamp
    "target_grating_scale": (75000, 85000),
    "current_grating_scale": (75000, 85000),
    "img_mod1_fw_version": (20240101, 20250101),
    "img_mod2_fw_version": (20240101, 20250101),
}

# Nominal enum states (unchanged from before)
NOMINAL_ENUM = {
    "cam_clock_locked": 1, "cam_lvds_locked": 1, "ai_health_status": 0,
    "thcc_control_loop_state": 1, "pwr_overcurrent_fault": 0, "pwr_efuse_state": 1,
    "unit_mode": 2, "unit_active_cdpm": 0, "unit_active_ctpu": 0,
}

# Fields that must stay 0 (fault flags, unused bitfields)
NOMINAL_CONST = {
    "pwr_uv_ov_status": 0, "ppc_fault_flags": 0, "ai_model_id": 1,
    "thcc_thermistor_ok": 1, "unit_last_tc_seq": 0, "unit_obc_time_corr": 0.0,
    "rs422_reset_count": 0, "heat_abnormal_ctr1": 0, "heat_abnormal_ctr2": 0,
    "heat_abnormal_ctr3": 0, "heat_abnormal_ctr4": 0,
    "img_mod1_cmd_err_count": 0, "img_mod2_cmd_err_count": 0,
    "img_mod1_pps_miss_count": 0, "img_mod2_pps_miss_count": 0,
    "cmd_cksum_err_count": 0, "cmd_param_err_count": 0, "cmd_illegal_err_count": 0,
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
    s = s.strip()
    if s.startswith('"'):
        return s.strip('"')
    try:
        return num(s)
    except ValueError:
        return s


def parse(path):
    """Reader for the flow-style AND block-style card/field lines used by ebox.yaml."""
    card_re = re.compile(r"^  ([A-Za-z0-9_]+):\s*(#.*)?$")
    attr_re = re.compile(r"^    (unit_sub_id|service|subservice|unit_id):\s*(\S+)")
    inline_field_re = re.compile(r"^\s+-\s*\{(.*)\}\s*(#.*)?$")
    block_field_start_re = re.compile(r"^\s+-\s+(\w+):\s*(.*?)\s*(#.*)?$")
    block_attr_re = re.compile(r"^\s+(\w+):\s*(.*?)\s*(#.*)?$")
    cards, cur, in_cards = {}, None, False
    current_field = None  # used when inside a block-form field

    try:
        lines = open(path).read().splitlines()
    except OSError as e:
        die("cannot read %s: %s" % (path, e))

    def flush_block_field():
        nonlocal current_field
        if current_field and cur is not None:
            for req in ("name", "offset", "type"):
                if req not in current_field:
                    die("field %r missing %r" % (current_field.get("name", "?"), req))
            cur["fields"].append(current_field)
        current_field = None

    for n, raw in enumerate(lines, 1):
        if raw.startswith("cards:"):
            in_cards = True
            continue
        if not in_cards or not raw.strip() or raw.lstrip().startswith("#"):
            continue

        # New card?
        m = card_re.match(raw)
        if m:
            flush_block_field()
            cur = cards[m.group(1)] = {"fields": []}
            continue

        # Card attribute (unit_sub_id, service, ...)?
        m = attr_re.match(raw)
        if m and cur is not None and not current_field:
            cur[m.group(1)] = num(m.group(2))
            continue

        # Inline field: `- { name: ..., ... }`
        m = inline_field_re.match(raw)
        if m and cur is not None:
            flush_block_field()
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
            continue

        # Block field start: `- name: ...`
        m = block_field_start_re.match(raw)
        if m and cur is not None:
            flush_block_field()
            current_field = {m.group(1): scalar(m.group(2))}
            continue

        # Inside a block field: `  offset: 11` etc.
        m = block_attr_re.match(raw)
        if m and current_field is not None:
            current_field[m.group(1)] = scalar(m.group(2))
            continue

    flush_block_field()

    if not cards:
        die("%s: no cards found under 'cards:'" % path)
    return cards


def band(f):
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

    # 1. Enum fields
    if "enum" in f:
        v = NOMINAL_ENUM.get(name, min(f["enum"]))
        if v not in f["enum"]:
            die("field %s: nominal state %r is not in its enum" % (name, v))
        return v

    # 2. Realistic raw values (for fields with calc formulas)
    if name in REALISTIC_RAW_VALUES:
        lo, hi = REALISTIC_RAW_VALUES[name]
        mid = (lo + hi) / 2.0
        half = (hi - lo) / 2.0
        # Each field gets a stable, unique period and phase
        h = zlib.crc32(("%s:%s" % (key, name)).encode())
        period = 60 + h % 61     # 60-120 packets per full swing
        phase = ((h >> 8) % 360) * math.pi / 180.0
        rng = random.Random(zlib.crc32(("%s:%s:%d" % (key, name, seq)).encode()))
        # Smooth sinusoidal drift with a small random jitter
        x = 0.70 * math.sin(2 * math.pi * seq / period + phase) + 0.10 * rng.uniform(-1, 1)
        v = mid + half * x
        # Clamp to the range
        v = max(lo, min(hi, v))
        return int(round(v))

    # 3. In-limits fields (temp setpoints, thresholds, etc.)
    b = band(f)
    if b:
        lo, hi = b
        mid, half = (lo + hi) / 2.0, (hi - lo) / 2.0
        h = zlib.crc32(("%s:%s" % (key, name)).encode())
        period = 40 + h % 41
        phase = ((h >> 8) % 360) * math.pi / 180.0
        rng = random.Random(zlib.crc32(("%s:%s:%d" % (key, name, seq)).encode()))
        x = 0.40 * math.sin(2 * math.pi * seq / period + phase) + 0.05 * rng.uniform(-1, 1)
        v = min(hi, max(lo, mid + half * x))
        return v if kind.startswith("f") else int(round(v))

    # 4. NOMINAL_CONST overrides (always same value)
    if name in NOMINAL_CONST:
        v = NOMINAL_CONST[name]
        return float(v) if kind.startswith("f") else int(v)

    # 5. Uptime counters
    if name.endswith("uptime_s"):
        return elapsed

    # 6. Overflow / reset counters stay 0
    if "ovf" in name or name.endswith("reset_count"):
        return 0

    # 7. Generic counters climb slowly
    if f.get("unit") == "cnt":
        return seq % (1 << (8 * TYPES[kind][1] - 1)) if not kind.startswith("f") else float(seq)

    # 8. Everything else → 0
    return 0.0 if kind.startswith("f") else 0


def build(key, c, seq, elapsed):
    # Only physical fields occupy bytes; calc fields are derived
    physical = [f for f in c["fields"]
                if f["type"] in TYPES and "calc" not in f]
    size = max(f["offset"] + TYPES[f["type"]][1] for f in physical)
    buf, shown, decoded = bytearray(size), [], {}

    for f in physical:
        fmt, n = TYPES[f["type"]]
        val = value(key, f, seq, elapsed)
        if f["type"] == "u24":
            v = int(val) & 0xFFFFFF
            raw = bytes([(v >> 16) & 0xFF, (v >> 8) & 0xFF, v & 0xFF])
        else:
            raw = struct.pack(fmt, val)
        buf[f["offset"]:f["offset"] + n] = raw
        if f["type"] == "u24":
            back = (raw[0] << 16) | (raw[1] << 8) | raw[2]
        else:
            back = struct.unpack(fmt, raw)[0]
        decoded[f["name"]] = back
        if "enum" in f:
            txt = "%s=%s" % (f["name"], f["enum"].get(back, back))
        else:
            unit = f.get("unit", "-")
            txt = "%s=%.5g%s" % (f["name"], back, "" if unit in ("-", "") else " " + unit)
        shown.append(txt)

    # Add calc fields to `shown` (they don't consume bytes but the UI
    # may want to display their raw+decoded view)
    for f in c["fields"]:
        if "calc" in f and f["name"] in decoded:
            # already added above
            continue
        if "calc" in f:
            # calc field — value comes from backend, script just shows it in verbose
            # For shown list, add a placeholder
            shown.append(f["name"] + "=(calc)")

    return bytes(buf), ", ".join(shown), decoded


def validate(cards, selected):
    for key in selected:
        c = cards[key]
        # Only PHYSICAL fields occupy payload bytes.
        # Fields with `calc:` are derived views — they share bytes with
        # their `calc_from` parent, so they must NOT be counted in spans.
        physical = [f for f in c["fields"]
                    if f["type"] in TYPES and "calc" not in f]
        spans = sorted((f["offset"], f["offset"] + TYPES[f["type"]][1], f["name"])
                       for f in physical)
        for f in c["fields"]:
            if f["type"] not in TYPES:
                die("%s.%s: unknown type '%s'" % (key, f["name"], f["type"]))
            band(f)
        for (a0, a1, an), (b0, b1, bn) in zip(spans, spans[1:]):
            if b0 < a1:
                die("%s: fields %s and %s overlap" % (key, an, bn))
        if spans and spans[-1][1] > MAX_PAYLOAD:
            die("%s: fields need %d bytes (max %d)" % (key, spans[-1][1], MAX_PAYLOAD))
        # Sanity check values
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

HOST=""
PORT=9200
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
Usage: $0 -H <host> [options]
  -H  destination host/IP                        (required)
  -p  UDP port                                   (default $PORT)
  -c  cards to send: 'all' or comma-separated
      card names or hex sub IDs                  (default $CARDS_ARG)
  -s  sub-header: 'fast' | 'slow'                (default $SUB_HDR)
  -n  rounds (no -f) or passes through the -f
      file; 0 = forever                          (default $COUNT, or 1 with -f)
  -i  seconds between rounds                     (default $INTERVAL)
  -g  seconds between packets inside a round     (default $GAP)
  -d  source data as hex string                  (default $DATA)
  -f  file of payload hex strings, one per line;
      each line = one round (cannot be used with -d)
  -y  TM dictionary yaml (ebox.yaml): payloads are built from its fields
      with physical values kept inside their limits
      (cannot be used with -d or -f)
  -z  with -y: do not zero-pad the payload to 237 bytes
  -v  print each packet as hex (with -y: also the decoded values)
  -l  list the known cards and exit
  -h  this help
EOF
  exit 1
}

list_cards() {
  printf '%-14s %-6s %-6s %-6s %s\n' "CARD" "SUB_ID" "SVC" "SUBSVC" "DESCRIPTION"
  for entry in "${ALL_CARDS[@]}"; do
    IFS='|' read -r key sub svc subsvc desc <<<"$entry"
    printf '%-14s 0x%02X   0x%02X   0x%02X   %s\n' \
      "$key" "$sub" "$svc" "$subsvc" "$desc"
  done
}

while getopts "H:p:c:s:n:i:g:d:f:y:zvlh" opt; do
  case $opt in
    H) HOST=$OPTARG ;;
    p) PORT=$OPTARG ;;
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

[[ -z "$HOST" ]] && usage

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

# ══════════════════════════════════════════════════════════════════════════
# Additive checksum: sum of all bytes mod 256
# ══════════════════════════════════════════════════════════════════════════

checksum8() {
  local hex=$1 sum=0 i byte
  for (( i = 0; i < ${#hex}; i += 2 )); do
    byte=$(( 16#${hex:i:2} ))
    sum=$(( (sum + byte) & 0xFF ))
  done
  printf '%02X' "$sum"
}

# ══════════════════════════════════════════════════════════════════════════
# Packet builder
# ══════════════════════════════════════════════════════════════════════════

declare -A SEQ=()      # per-card sequence counter (14-bit, wraps at 0x3FFF)

sent=0
CUR_SRC_LINE=0         # file line of the payload currently being sent

send_packet() {
  local card=$1

  local sub_id=${CARD_SUBID[$card]}
  local svc=${CARD_SVC[$card]}
  local subsvc=${CARD_SUBSVC[$card]}
  local seq=${SEQ[$card]:-0}

  # ── Payload for this packet ──────────────────────────────────────────
  local payload=$DATA values=""
  if [[ -n "$YAML_FILE" ]]; then
    local gen
    gen=$(python3 -I -c "$PY_GEN" gen "$YAML_FILE" "$card" "$seq" "$START_EPOCH" "$PAD" "$VERBOSE")
    payload=${gen%%$'\n'*}
    if [[ "$gen" == *$'\n'* ]]; then values=${gen#*$'\n'}; fi
  fi

  # ── Main header (6 bytes) ────────────────────────────────────────────
  # word0: version(3) | type(1) | sub-hdr-flag(1) | APID(11)
  local word0=$(( (EBOX_VERSION << 13) | (0 << 12) | (1 << 11) | EBOX_APID ))
  # word1: seq flags(2) | seq count(14)
  local word1=$(( (SEQ_FLAGS_UNSEGMENTED << 14) | (seq & 0x3FFF) ))

  # ── Sub-header + effective data header (5 bytes) ─────────────────────
  local sub_hdr_hex=$(printf '%02X' "$SUB_HDR_BYTE")
  local eff_hdr_hex=$(printf '%02X%02X%02X%02X' \
    "$EBOX_UNIT_ID" "$sub_id" "$svc" "$subsvc")

  # ── Assemble body (main-header-word2 excluded — it depends on length) ─
  # Body = sub-header + effective data header + payload
  local body="${sub_hdr_hex}${eff_hdr_hex}${payload}"

  # ── Packet data length field ────────────────────────────────────────
  # Per ICD: packet data field = sub-header + effective data + checksum.
  # Length field = (packet_data_field_len) - 1
  local body_len=$(( ${#body} / 2 ))
  local pkt_data_field_len=$(( body_len + 1 ))          # +1 for checksum
  local length_field=$(( pkt_data_field_len - 1 ))

  local word2_hex=$(printf '%04X' "$length_field")
  local word0_hex=$(printf '%04X' "$word0")
  local word1_hex=$(printf '%04X' "$word1")

  # ── Compute checksum over main header + sub-header + effective data ─
  # Checksum area = word0 + word1 + word2 + body (not the checksum byte itself)
  local checksum_area="${word0_hex}${word1_hex}${word2_hex}${body}"
  local cs_hex=$(checksum8 "$checksum_area")

  # ── Inner CCSDS-style packet ────────────────────────────────────────
  local inner="${word0_hex}${word1_hex}${word2_hex}${body}${cs_hex}"

  # ── Wrap in outer frame ─────────────────────────────────────────────
  local frame="${OUTER_HEADER_HEX}${inner}${OUTER_TRAILER_HEX}"

  # ── Send via /dev/udp ───────────────────────────────────────────────
  # dd with iflag=fullblock guarantees a single write() → one datagram.
  printf "$(sed 's/../\\x&/g' <<<"$frame")" \
    | dd bs=$(( ${#frame} / 2 )) count=1 iflag=fullblock status=none \
    > "/dev/udp/${HOST}/${PORT}"

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
# Main loop
#   round = one payload sent to every selected card
#   pass  = every payload in the list sent once (= the whole file with -f)
#   Without -f the list holds one payload, so a pass is one round and
#   -n keeps its original meaning (number of rounds).
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

    # Finished the last payload of the last requested pass → stop (no trailing sleep)
    if (( COUNT > 0 && pass >= COUNT && idx == n_payloads - 1 )); then
      break 2
    fi
    sleep "$INTERVAL"
  done
done

if [[ -n "$PAYLOAD_FILE" ]]; then
  echo "Sent $sent EBOX TM packet(s) ($round round(s), $pass pass(es) of ${n_payloads} payload(s) × ${#CARDS[@]} card(s)) to ${HOST}:${PORT}/udp"
else
  echo "Sent $sent EBOX TM packet(s) ($round round(s) × ${#CARDS[@]} card(s)) to ${HOST}:${PORT}/udp"
fi
