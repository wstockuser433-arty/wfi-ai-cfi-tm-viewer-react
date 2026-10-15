#!/usr/bin/env bash
# send_pus_tm.sh - send PUS (ECSS-E-ST-70-41C) TM packets over UDP using only bash.
#
# Packet layout (big-endian):
#   Primary header (6 B): version(3)=0 | type(1)=0 TM | sec-hdr flag(1)=1 | APID(11)
#                         seq flags(2)=11 | seq count(14) | packet data length(16)
#   Secondary header (13 B): PUS version(4)=2 | time ref status(4)=0
#                            service type(8) | subtype(8) | msg type counter(16)
#                            destination ID(16) | time: 4 B coarse + 2 B fine
#   Source data (N B)
#   Packet error control (2 B): CRC-16/CCITT-FALSE (poly 0x1021, init 0xFFFF)
#
# Each APID keeps its own sequence counter and message counter, so a multi-APID
# run behaves like a real source: every APID's stream counts 0,1,2,...
#
# Usage: ./send_pus_tm.sh -H <PC2_IP> [-a all|APID,APID,NAME,...] [-p 9200]
#                         [-s 3] [-t 25] [-n 10] [-i 1] [-g 0] [-d DEADBEEF]
#                         [-D 0] [-v] [-l]
#
# Optional hints for the GUI launcher (script_launcher.py). Plain comments for bash.
# @launcher title: PUS TM Packet Sender
# @launcher about: Sends PUS TM packets over UDP. -n 0 = run until you press Stop.
# @launcher defaults: -n 0 -i 1 -v
# @launcher hide: -l -h

set -euo pipefail

# ---------------------------------------------------------------- APID table
ALL_APIDS=(256 272 273 274 288 289 304 305 320 321 336 512 513 514 515 516 517 518)

declare -A APID_NAME=(
  [256]="CAM_ELEC"        [272]="CDPM_P_FPGA"     [273]="CDPM_P_AI"
  [274]="CDPM_P_THCC"     [288]="CDPM_R_FPGA"     [289]="CDPM_R_AI"
  [304]="CTPU_P_PWR"      [305]="CTPU_P_PPC"      [320]="CTPU_R_PWR"
  [321]="CTPU_R_PPC"      [336]="UNIT_HK"         [512]="CAM_CDPM_P"
  [513]="CAM_CDPM_R"      [514]="CDPM_P_CTPU_P"   [515]="CDPM_R_CTPU_R"
  [516]="CTPU_P_SC"       [517]="CTPU_R_SC"       [518]="CDPM_CROSSSTRAP"
)
declare -A APID_DESC=(
  [256]="Camera Electronics Card"      [272]="FPGA Processing Card"
  [273]="AI Board"                     [274]="Thermal Control Card"
  [288]="FPGA Processing Card"         [289]="AI Board"
  [304]="Power Card"                   [305]="Power Processing Card"
  [320]="Power Card"                   [321]="Power Processing Card"
  [336]="Unit Housekeeping"            [512]="Camera <-> CDPM (P)"
  [513]="Camera <-> CDPM (R)"          [514]="CDPM (P) <-> CTPU (P)"
  [515]="CDPM (R) <-> CTPU (R)"        [516]="CTPU (P) <-> Spacecraft"
  [517]="CTPU (R) <-> Spacecraft"      [518]="CDPM (P) <-> CDPM (R)"
)

# ------------------------------------------------------------------ defaults
HOST=""; PORT=9200; APID_ARG="all"; SERVICE=3; SUBTYPE=25
COUNT=10; INTERVAL=1; GAP=0; DEST=0; DATA="DEADBEEF"; VERBOSE=0

list_apids() {
  printf '%-7s %-5s %-18s %s\n' "HEX" "DEC" "NAME" "DESCRIPTION"
  local a
  for a in "${ALL_APIDS[@]}"; do
    printf '0x%03X   %-5d %-18s %s\n' "$a" "$a" "${APID_NAME[$a]}" "${APID_DESC[$a]}"
  done
}

usage() {
  cat <<EOF
Usage: $0 -H <host> [options]
  -H  destination host/IP (PC2)                         (required)
  -p  UDP port                                          (default $PORT)
  -a  APIDs to send: 'all', or a comma-separated list of
      hex (0x110), decimal (272) or names (CDPM_P_FPGA) (default $APID_ARG)
  -s  PUS service type, 0-255                           (default $SERVICE)
  -t  PUS message subtype, 0-255                        (default $SUBTYPE)
  -n  rounds; one packet per APID per round, 0 = forever (default $COUNT)
  -i  seconds between rounds                            (default $INTERVAL)
  -g  seconds between packets inside a round            (default $GAP)
  -d  source data as hex string                         (default $DATA)
  -D  destination ID, 0-65535                           (default $DEST)
  -v  print each packet as hex
  -l  list the known APIDs and exit
EOF
  exit 1
}

while getopts "H:p:a:s:t:n:i:g:d:D:vlh" opt; do
  case $opt in
    H) HOST=$OPTARG ;;
    p) PORT=$OPTARG ;;
    a) APID_ARG=$OPTARG ;;
    s) SERVICE=$OPTARG ;;
    t) SUBTYPE=$OPTARG ;;
    n) COUNT=$OPTARG ;;
    i) INTERVAL=$OPTARG ;;
    g) GAP=$OPTARG ;;
    d) DATA=$OPTARG ;;
    D) DEST=$OPTARG ;;
    v) VERBOSE=1 ;;
    l) list_apids; exit 0 ;;
    *) usage ;;
  esac
done

[[ -z "$HOST" ]] && usage
DATA=${DATA^^}
[[ "$DATA" =~ ^([0-9A-F]{2})*$ ]] || { echo "Error: -d must be an even-length hex string" >&2; exit 1; }

# name | 0xHEX | decimal  ->  decimal APID on stdout (validated 0..2047)
resolve_apid() {
  local tok=$1 up=${1^^} n
  for n in "${ALL_APIDS[@]}"; do
    if [[ "${APID_NAME[$n]}" == "$up" ]]; then echo "$n"; return 0; fi
  done
  if [[ "$tok" =~ ^0[xX][0-9A-Fa-f]+$ || "$tok" =~ ^(0|[1-9][0-9]*)$ ]]; then
    n=$(( tok ))
    if (( n >= 0 && n <= 2047 )); then echo "$n"; return 0; fi
  fi
  echo "Error: unknown or out-of-range APID '$tok' (use -l to list known APIDs)" >&2
  return 1
}

APIDS=()
IFS=',' read -ra TOKENS <<<"$APID_ARG"
for tok in "${TOKENS[@]}"; do
  tok=${tok//[[:space:]]/}
  [[ -z "$tok" ]] && continue
  if [[ "${tok,,}" == "all" ]]; then
    APIDS+=("${ALL_APIDS[@]}")
  else
    APIDS+=("$(resolve_apid "$tok")")
  fi
done
(( ${#APIDS[@]} > 0 )) || { echo "Error: no APIDs selected" >&2; exit 1; }

# CRC-16/CCITT-FALSE over a hex string, prints 4 hex digits
crc16() {
  local hex=$1 crc=$((0xFFFF)) i j byte
  for (( i = 0; i < ${#hex}; i += 2 )); do
    byte=$(( 16#${hex:i:2} ))
    crc=$(( crc ^ (byte << 8) ))
    for j in 0 1 2 3 4 5 6 7; do
      if (( crc & 0x8000 )); then crc=$(( (crc << 1) ^ 0x1021 )); else crc=$(( crc << 1 )); fi
      crc=$(( crc & 0xFFFF ))
    done
  done
  printf '%04X' "$crc"
}

declare -A SEQ=()      # per-APID source sequence count (14 bit)
declare -A MSGCNT=()   # per-APID message type counter (16 bit)
sent=0
data_len=$(( ${#DATA} / 2 ))

send_packet() {
  local apid=$1 seq mc now secs ns fine sec body pkt_len pri crc packet name
  seq=${SEQ[$apid]:-0}
  mc=${MSGCNT[$apid]:-0}

  # Time: coarse = Unix seconds (32 bit), fine = 1/65536 s units (16 bit)
  now=$(date +%s.%N); secs=${now%.*}; ns=$((10#${now#*.}))
  fine=$(( ns * 65536 / 1000000000 ))

  # Secondary header + data
  sec=$(printf '%02X%02X%02X%04X%04X%08X%04X' \
        $((0x20)) "$SERVICE" "$SUBTYPE" "$mc" "$DEST" "$secs" "$fine")
  body="${sec}${DATA}"

  # Packet data length = (secondary hdr + data + CRC) - 1
  pkt_len=$(( 13 + data_len + 2 - 1 ))
  pri=$(printf '%04X%04X%04X' $(( 0x0800 | apid )) $(( 0xC000 | (seq & 0x3FFF) )) "$pkt_len")

  crc=$(crc16 "${pri}${body}")
  packet="${pri}${body}${crc}"

  # hex -> raw bytes -> exactly one UDP datagram via bash's /dev/udp.
  # dd (fullblock, one block of the exact packet size) does a single write(), so
  # bytes such as 0x0A can never split the packet into several datagrams.
  printf "$(sed 's/../\\x&/g' <<<"$packet")" \
    | dd bs=$(( ${#packet} / 2 )) count=1 iflag=fullblock status=none \
    > "/dev/udp/${HOST}/${PORT}"

  sent=$(( sent + 1 ))
  if (( VERBOSE )); then
    name=${APID_NAME[$apid]:-APID_$apid}
    printf '[%d] APID 0x%03X (%d) %-16s seq=%-5d len=%d B: %s\n' \
      "$sent" "$apid" "$apid" "$name" "$seq" "$(( ${#packet} / 2 ))" "$packet"
  fi

  SEQ[$apid]=$(( (seq + 1) & 0x3FFF ))
  MSGCNT[$apid]=$(( (mc + 1) & 0xFFFF ))
}

round=0
while :; do
  for apid in "${APIDS[@]}"; do
    send_packet "$apid"
    if [[ "$GAP" != "0" ]]; then sleep "$GAP"; fi
  done
  round=$(( round + 1 ))
  if (( COUNT > 0 && round >= COUNT )); then break; fi
  sleep "$INTERVAL"
done

echo "Sent $sent PUS TM packet(s) ($round round(s) x ${#APIDS[@]} APID(s)) to ${HOST}:${PORT}/udp"
