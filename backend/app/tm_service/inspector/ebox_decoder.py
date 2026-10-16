"""
EBOX Decoder
============

Parses telemetry packets built to the RS-422 / EBOX ICD spec.

Wire format (see ICD sections 3 and 4):

    ┌─ CCSDS-style packet ──────────────────────────────────────────┐
    │                                                               │
    │  Offset  Size   Field                                        │
    │  ------  -----  --------------------------------------------  │
    │  0-1      2 B   Version(3) | Type(1) | SubHdrFlag(1) | APID   │
    │                 Version = 010b                                │
    │                 Type    = 0 (TM) / 1 (TC)                     │
    │                 SubHdr  = 1 (always present)                  │
    │                 APID    = 0x2B (fixed for EBOX)               │
    │  2-3      2 B   SeqFlag(2) | SeqCount(14)                     │
    │  4-5      2 B   Packet Length = data_field_len - 1            │
    │  6        1 B   Sub-header                                    │
    │                 (1 byte for ordinary TM/TC; 5 bytes for SW   │
    │                  reassembly — the latter is out of scope)     │
    │  7        1 B   Unit ID (0x1A)                                │
    │  8        1 B   Unit Sub ID                                   │
    │  9        1 B   Service Type                                  │
    │  10       1 B   Sub-Service Type                              │
    │  11..N    1 B   Payload — offset-based fields                 │
    │  N+1      1 B   Additive checksum (sum of preceding bytes)    │
    │                                                               │
    └───────────────────────────────────────────────────────────────┘

The packet emitted by Rs422Framer is exactly the bytes above (no outer frame).

The decoder:
    1.  Verifies the APID, version, sub-header flag
    2.  Extracts the sequence flag + count
    3.  Verifies the additive checksum
    4.  Reads the sub-header byte
    5.  Reads the 4-byte effective-data header (Unit ID, Sub ID, Svc, Sub-svc)
    6.  Looks up the (unit_sub_id, service, subservice) triple in ebox.yaml
    7.  Extracts the payload fields via struct.unpack_from
    8.  Returns a DecodedPacket-shaped dict

TBD items (mark with `grep TBD` before shipping to the EBOX team):
  - What is the exact sequence-flag value? ICD says "11" for normal TM
  - Should we reject packets with a wrong version field? ICD says "not verified"
  - Should the checksum byte be excluded from the sum? ICD §4.1 says yes
"""

from __future__ import annotations

import logging
import struct
from typing import Any

from .base import PacketDecoder
from .ebox_checksum import compute_ebox_checksum
from ..registry_ebox import get_ebox_registry

log = logging.getLogger(__name__)

# ─── Fixed header values per ICD ────────────────────────────────────────
EBOX_APID = 0x02B
EBOX_VERSION = 0b010

# ─── Header / sub-header offsets within the CCSDS-style packet ──────────
MAIN_HDR_LEN = 6
SUB_HDR_LEN_1BYTE = 1            # ordinary TM/TC
SUB_HDR_LEN_5BYTE = 5            # software reassembly (TBD — not implemented)

# Offsets within the *effective data field* (after main header + sub-header)
EFFECTIVE_DATA_HEADER_LEN = 4    # Unit ID, Unit Sub ID, Service, Sub-Service
PAYLOAD_OFFSET_IN_EFFECTIVE = EFFECTIVE_DATA_HEADER_LEN

# ─── Struct helpers ─────────────────────────────────────────────────────
TYPE_FMT = {
    "f32": "f", "f64": "d",
    "u8": "B", "u16": "H", "u32": "I",
    "i8": "b", "i16": "h", "i32": "i",
}
TYPE_SIZE = {
    "f32": 4, "f64": 8,
    "u8": 1, "u16": 2, "u32": 4,
    "i8": 1, "i16": 2, "i32": 4,
}


class EboxDecoder(PacketDecoder):
    """
    Decoder for the RS-422 / EBOX protocol defined in the WFI-AI-CFI ICD v1.2.

    The unique identifier is the triple (unit_sub_id, service, subservice),
    not the APID (which is fixed at 0x2B). See ebox.yaml for the mapping.
    """

    def decode(self, raw: bytes, timestamp: float) -> dict[str, Any]:
        # --- Minimum length sanity -------------------------------------
        min_len = MAIN_HDR_LEN + SUB_HDR_LEN_1BYTE + EFFECTIVE_DATA_HEADER_LEN + 1
        if len(raw) < min_len:
            raise ValueError(
                f"EBOX packet too short ({len(raw)} < {min_len})"
            )

        # --- Parse the main header -------------------------------------
        word0 = struct.unpack_from(">H", raw, 0)[0]
        version = (word0 >> 13) & 0b111
        pkt_type = (word0 >> 12) & 0b1
        sub_hdr_flag = (word0 >> 11) & 0b1
        apid = word0 & 0x7FF

        seq_word = struct.unpack_from(">H", raw, 2)[0]
        seq_flags = (seq_word >> 14) & 0b11
        seq_count = seq_word & 0x3FFF

        length_field = struct.unpack_from(">H", raw, 4)[0]

        # --- Verify per ICD -------------------------------------------
        if version != EBOX_VERSION:
            # ICD says "receiving device does not perform any verification"
            # — we log but accept.
            log.debug("EBOX version field %03b != expected %03b", version, EBOX_VERSION)

        if pkt_type != 0:
            raise ValueError(
                f"EBOX decoder got a TC packet (type={pkt_type}); "
                f"this decoder handles TM only"
            )

        if sub_hdr_flag != 1:
            raise ValueError(
                f"EBOX sub-header flag = {sub_hdr_flag}; ICD requires 1"
            )

        if apid != EBOX_APID:
            raise ValueError(
                f"EBOX APID = 0x{apid:03X}; ICD specifies 0x{EBOX_APID:03X}"
            )

        # --- Compute expected packet boundaries ------------------------
        # Packet length field = "number of bytes in packet data field minus 1"
        # packet data field = sub-header + effective data + checksum
        # total CCSDS packet = 6 (main hdr) + 1 (length field) + length_field_value
        expected_total = MAIN_HDR_LEN + 1 + length_field
        if len(raw) < expected_total:
            raise ValueError(
                f"EBOX packet length field implies {expected_total} bytes "
                f"but only {len(raw)} are present"
            )

        checksum_offset = expected_total - 1
        checksum_rx = raw[checksum_offset]
        body = raw[:checksum_offset]  # main hdr + sub-hdr + effective data

        # --- Verify checksum -------------------------------------------
        checksum_calc = compute_ebox_checksum(body)
        crc_ok = checksum_calc == checksum_rx

        # --- Parse the sub-header --------------------------------------
        sub_hdr_offset = MAIN_HDR_LEN
        sub_hdr_value = raw[sub_hdr_offset]
        sub_hdr_len = SUB_HDR_LEN_1BYTE

        # Sub-header semantics from ICD §4.1.1 (Table 4):
        #   0001 → Type 1 Fast Telemetry
        #   0010 → Type 2 Slow Telemetry (also indirect command marker for TC)
        sub_hdr_label = {
            0x01: "FAST_TM",
            0x02: "SLOW_TM",
        }.get(sub_hdr_value, f"UNKNOWN(0x{sub_hdr_value:02X})")

        # --- Parse the effective data header ---------------------------
        eff_start = sub_hdr_offset + sub_hdr_len
        unit_id = raw[eff_start + 0]
        unit_sub_id = raw[eff_start + 1]
        service = raw[eff_start + 2]
        subservice = raw[eff_start + 3]

        # --- Look up the card spec in ebox.yaml ------------------------
        reg = get_ebox_registry()
        spec = reg.lookup(unit_sub_id, service, subservice)

        # --- Extract payload fields ------------------------------------
        payload_start = eff_start + PAYLOAD_OFFSET_IN_EFFECTIVE
        payload_end = checksum_offset
        payload = raw[payload_start:payload_end]

        fields: dict[str, Any] = {}
        if spec:
            fields = self._extract_fields(payload, spec)

        # --- Metadata for the UI ---------------------------------------
        if spec:
            subsystem = spec["subsystem"]
            card_label = spec["card_label"]
            card_key = spec["card"]
            hw_class = spec.get("hw_class", "HW")
        else:
            subsystem = "EBOX"
            card_label = f"UNKNOWN({unit_sub_id:#04x},{service:#04x},{subservice:#04x})"
            card_key = "UNKNOWN"
            hw_class = "HW"

        # --- Build the DecodedPacket-shaped dict -----------------------
        return {
            "cc": 0x08,             # keep shape-compatible with other decoders
            # The frontend keys its lookup by `apid`. For EBOX, the real
    # discriminator is unit_sub_id, so we expose that as `apid` to
    # match what /api/meta advertises as the dropdown key.
            "apid": unit_sub_id,
            "apid_name": card_label,
            "subsystem": subsystem,
            "card": card_key,
            "hw_class": hw_class,
            "seq": seq_count,
            "length": len(payload),
            "crc_ok": crc_ok,
            "payload_hex": payload.hex(),
            "raw_hex": raw.hex(),
            "fields": fields,
            "timestamp": timestamp,

            # ---- EBOX-specific extras (rendered as extra rows in UI) --
            "service_type": service,
            "service_subtype": subservice,
            "unit_id": unit_id,
            "unit_sub_id": unit_sub_id,
            "sub_hdr_value": sub_hdr_value,
            "sub_hdr_label": sub_hdr_label,
            "seq_flags": seq_flags,
        }

    # ---------------------------------------------------------------- #
    @staticmethod
    def _extract_fields(payload: bytes, spec: dict) -> dict[str, Any]:
        """Extract fields from the payload using the YAML-specified offsets."""
        out: dict[str, Any] = {}
        for f in spec.get("fields", []):
            name = f["name"]
            off = f["offset"]
            typ = f["type"]
            size = TYPE_SIZE[typ]

            if off + size > len(payload):
                continue

            val = struct.unpack_from(">" + TYPE_FMT[typ], payload, off)[0]
            if typ in ("f32", "f64"):
                val = round(val, 4)

            status = EboxDecoder._status(val, f)
            enum_norm = None
            if f.get("enum"):
                enum_norm = {str(k): str(v) for k, v in f["enum"].items()}

            out[name] = {
                "value": val,
                "unit": f.get("unit", ""),
                "limits": [f.get("ltl"), f.get("htl")],
                "status": status,
                "enum": enum_norm,
            }
        return out

    @staticmethod
    def _status(v: float, spec: dict) -> str:
        ltl, htl = spec.get("ltl"), spec.get("htl")
        lth, hth = spec.get("lth"), spec.get("hth")
        if ltl is None and htl is None:
            return "OK"
        if ltl is not None and v < ltl:
            return "CRIT"
        if htl is not None and v > htl:
            return "CRIT"
        if lth is not None and v < lth:
            return "WARN"
        if hth is not None and v > hth:
            return "WARN"
        return "OK"