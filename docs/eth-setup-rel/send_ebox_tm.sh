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
# Usage:
#   ./send_ebox_tm.sh -H <host> [options]
#   ./send_ebox_tm.sh -H 127.0.0.1 -n 5 -v
#   ./send_ebox_tm.sh -H 127.0.0.1 -c CAM_ELEC -d DEADBEEF -n 20
#   ./send_ebox_tm.sh -l            # list all cards
#
# Options:
#   -H  destination host/IP                (required)
#   -p  UDP port                           (default 9200)
#   -c  cards to send: 'all', or a comma-separated list of
#       card names (CAM_ELEC, CDPM_P_AI, ...) or hex sub IDs (0x10)
#   -s  sub-header: 'fast' | 'slow'         (default fast)
#   -n  rounds, one packet per card per round, 0 = forever  (default 10)
#   -i  seconds between rounds             (default 1)
#   -g  seconds between packets in a round (default 0)
#   -d  source data as hex string          (default DEADBEEF)
#   -v  print each packet as hex
#   -l  list known cards and exit
#   -h  this help

set -euo pipefail

# ══════════════════════════════════════════════════════════════════════════
# Card table — must match backend/app/tm_dictionary/ebox.yaml
# ══════════════════════════════════════════════════════════════════════════

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

# ══════════════════════════════════════════════════════════════════════════
# Defaults
# ══════════════════════════════════════════════════════════════════════════

HOST=""
PORT=9200
CARDS_ARG="all"
SUB_HDR="fast"
COUNT=10
INTERVAL=1
GAP=0
DATA="DEADBEEF"
VERBOSE=0

usage() {
  cat <<EOF
Usage: $0 -H <host> [options]
  -H  destination host/IP                        (required)
  -p  UDP port                                   (default $PORT)
  -c  cards to send: 'all' or comma-separated
      card names or hex sub IDs                  (default $CARDS_ARG)
  -s  sub-header: 'fast' | 'slow'                (default $SUB_HDR)
  -n  rounds, one packet per card per round,
      0 = forever                                (default $COUNT)
  -i  seconds between rounds                     (default $INTERVAL)
  -g  seconds between packets inside a round     (default $GAP)
  -d  source data as hex string                  (default $DATA)
  -v  print each packet as hex
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

while getopts "H:p:c:s:n:i:g:d:vlh" opt; do
  case $opt in
    H) HOST=$OPTARG ;;
    p) PORT=$OPTARG ;;
    c) CARDS_ARG=$OPTARG ;;
    s) SUB_HDR=$OPTARG ;;
    n) COUNT=$OPTARG ;;
    i) INTERVAL=$OPTARG ;;
    g) GAP=$OPTARG ;;
    d) DATA=$OPTARG ;;
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

DATA=${DATA^^}
[[ "$DATA" =~ ^([0-9A-F]{2})*$ ]] || { echo "Error: -d must be an even-length hex string" >&2; exit 1; }
DATA_LEN=$(( ${#DATA} / 2 ))
(( DATA_LEN <= 237 )) || { echo "Error: payload too large (max 237 bytes)" >&2; exit 1; }

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

send_packet() {
  local card=$1

  local sub_id=${CARD_SUBID[$card]}
  local svc=${CARD_SVC[$card]}
  local subsvc=${CARD_SUBSVC[$card]}
  local seq=${SEQ[$card]:-0}

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
  local body="${sub_hdr_hex}${eff_hdr_hex}${DATA}"

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
    printf 'inner=%d B, frame=%d B\n' "$inner_bytes" "$frame_bytes"
    printf '        frame: %s\n' "$frame"
  fi

  SEQ[$card]=$(( (seq + 1) & 0x3FFF ))
}

# ══════════════════════════════════════════════════════════════════════════
# Main loop
# ══════════════════════════════════════════════════════════════════════════

round=0
while :; do
  for card in "${CARDS[@]}"; do
    send_packet "$card"
    if [[ "$GAP" != "0" ]]; then sleep "$GAP"; fi
  done
  round=$(( round + 1 ))
  if (( COUNT > 0 && round >= COUNT )); then break; fi
  sleep "$INTERVAL"
done

echo "Sent $sent EBOX TM packet(s) ($round round(s) × ${#CARDS[@]} card(s)) to ${HOST}:${PORT}/udp"