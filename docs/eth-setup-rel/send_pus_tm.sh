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
# Usage: ./send_pus_tm.sh -H <PC2_IP> [-p 9200] [-a 100] [-s 3] [-t 25]
#                         [-n 10] [-i 1] [-d DEADBEEF] [-D 0] [-v]

set -euo pipefail

HOST=""; PORT=9200; APID=100; SERVICE=3; SUBTYPE=25
COUNT=10; INTERVAL=1; DEST=0; DATA="DEADBEEF"; VERBOSE=0

usage() {
  cat <<EOF
Usage: $0 -H <host> [options]
  -H  destination host/IP (PC2)            (required)
  -p  UDP port                             (default $PORT)
  -a  APID, 0-2047                         (default $APID)
  -s  PUS service type, 0-255              (default $SERVICE)
  -t  PUS message subtype, 0-255           (default $SUBTYPE)
  -n  number of packets, 0 = forever       (default $COUNT)
  -i  interval between packets, seconds    (default $INTERVAL)
  -d  source data as hex string            (default $DATA)
  -D  destination ID, 0-65535              (default $DEST)
  -v  print each packet as hex
EOF
  exit 1
}

while getopts "H:p:a:s:t:n:i:d:D:vh" opt; do
  case $opt in
    H) HOST=$OPTARG ;;
    p) PORT=$OPTARG ;;
    a) APID=$OPTARG ;;
    s) SERVICE=$OPTARG ;;
    t) SUBTYPE=$OPTARG ;;
    n) COUNT=$OPTARG ;;
    i) INTERVAL=$OPTARG ;;
    d) DATA=$OPTARG ;;
    D) DEST=$OPTARG ;;
    v) VERBOSE=1 ;;
    *) usage ;;
  esac
done

[[ -z "$HOST" ]] && usage
DATA=${DATA^^}
[[ "$DATA" =~ ^([0-9A-F]{2})*$ ]] || { echo "Error: -d must be an even-length hex string" >&2; exit 1; }
(( APID >= 0 && APID <= 2047 )) || { echo "Error: APID must be 0-2047" >&2; exit 1; }

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

seq=0       # source sequence count (14 bit), per APID
msgcnt=0    # message type counter (16 bit)
sent=0
data_len=$(( ${#DATA} / 2 ))

while :; do
  # Time: coarse = Unix seconds (32 bit), fine = 1/65536 s units (16 bit)
  now=$(date +%s.%N); secs=${now%.*}; ns=$((10#${now#*.}))
  fine=$(( ns * 65536 / 1000000000 ))

  # Secondary header + data (everything the length field and CRC cover after the primary header)
  sec=$(printf '%02X%02X%02X%04X%04X%08X%04X' \
        $((0x20)) "$SERVICE" "$SUBTYPE" "$msgcnt" "$DEST" "$secs" "$fine")
  body="${sec}${DATA}"

  # Packet data length = (secondary hdr + data + CRC) - 1
  pkt_len=$(( 13 + data_len + 2 - 1 ))
  pri=$(printf '%04X%04X%04X' $(( 0x0800 | APID )) $(( 0xC000 | (seq & 0x3FFF) )) "$pkt_len")

  crc=$(crc16 "${pri}${body}")
  packet="${pri}${body}${crc}"

  # hex -> raw bytes -> one UDP datagram via bash's /dev/udp
  printf "$(sed 's/../\\x&/g' <<<"$packet")" > "/dev/udp/${HOST}/${PORT}"

  sent=$(( sent + 1 ))
  (( VERBOSE )) && echo "[$sent] seq=$seq len=$(( ${#packet} / 2 )) B: $packet"

  seq=$(( (seq + 1) & 0x3FFF ))
  msgcnt=$(( (msgcnt + 1) & 0xFFFF ))
  (( COUNT > 0 && sent >= COUNT )) && break
  sleep "$INTERVAL"
done

echo "Sent $sent PUS TM packet(s) to ${HOST}:${PORT}/udp"
