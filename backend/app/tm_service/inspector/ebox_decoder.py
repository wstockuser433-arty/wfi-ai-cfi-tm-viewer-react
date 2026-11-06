"""
EBOX Decoder
============

Parses telemetry packets built to the RS-422 / EBOX ICD v1.2.

Wire format:

    ┌─ CCSDS-style packet ──────────────────────────────────────────┐
    │  0-1    2 B   Version(3) | Type(1) | SubHdrFlag(1) | APID      │
    │               Version = 010b, Type = 0 (TM), SubHdr = 1        │
    │               APID    = 0x2B (fixed for EBOX)                  │
    │  2-3    2 B   SeqFlag(2) | SeqCount(14)                        │
    │  4-5    2 B   Packet Length = data_field_len - 1               │
    │  6      1 B   Sub-header (0x01 = Fast TM, 0x02 = Slow TM)      │
    │  7      1 B   Unit ID                                          │
    │  8      1 B   Unit Sub ID                                      │
    │  9      1 B   Service Type                                     │
    │ 10      1 B   Sub-Service Type                                 │
    │ 11..N   N B   Payload (fields via ebox.yaml offsets)           │
    │ N+1     1 B   Additive checksum (sum mod 256)                  │
    └───────────────────────────────────────────────────────────────┘
"""

from __future__ import annotations

import math
import logging
import struct
from typing import Any

from .base import PacketDecoder
from .ebox_calcs import apply_calc
from .ebox_checksum import compute_ebox_checksum
from ..registry_ebox import get_ebox_registry

log = logging.getLogger(__name__)

# ─── Fixed header values per ICD ────────────────────────────────────────
EBOX_APID = 0x02B
EBOX_VERSION = 0b010

# ─── Header / sub-header offsets within the CCSDS-style packet ──────────
MAIN_HDR_LEN = 6
SUB_HDR_LEN_1BYTE = 1
SUB_HDR_LEN_5BYTE = 5  # not implemented

# Offsets within the *effective data field* (after main header + sub-header)
EFFECTIVE_DATA_HEADER_LEN = 4
PAYLOAD_OFFSET_IN_EFFECTIVE = EFFECTIVE_DATA_HEADER_LEN

# ─── Struct helpers ─────────────────────────────────────────────────────
TYPE_FMT = {
    "f32": "f", "f64": "d",
    "u8": "B", "u16": "H", "u32": "I", "u24": None,   # u24 handled specially
    "i8": "b", "i16": "h", "i32": "i",
}
TYPE_SIZE = {
    "f32": 4, "f64": 8,
    "u8": 1, "u16": 2, "u32": 4, "u24": 3,
    "i8": 1, "i16": 2, "i32": 4,
}


class EboxDecoder(PacketDecoder):
    """EBOX protocol decoder — 4-tuple keyed per ICD v1.2."""

    def decode(self, raw: bytes, timestamp: float) -> dict[str, Any]:
        # ── Minimum length sanity ──────────────────────────────────
        min_len = (
            MAIN_HDR_LEN
            + SUB_HDR_LEN_1BYTE
            + EFFECTIVE_DATA_HEADER_LEN
            + 1  # checksum
        )
        if len(raw) < min_len:
            raise ValueError(f"EBOX packet too short ({len(raw)} < {min_len})")

        # ── Parse main header ──────────────────────────────────────
        word0 = struct.unpack_from(">H", raw, 0)[0]
        version = (word0 >> 13) & 0b111
        pkt_type = (word0 >> 12) & 0b1
        sub_hdr_flag = (word0 >> 11) & 0b1
        apid = word0 & 0x7FF

        seq_word = struct.unpack_from(">H", raw, 2)[0]
        seq_flags = (seq_word >> 14) & 0b11
        seq_count = seq_word & 0x3FFF

        length_field = struct.unpack_from(">H", raw, 4)[0]

        # ── Verify ─────────────────────────────────────────────────
        if version != EBOX_VERSION:
            log.debug(
                "EBOX version field %03b != expected %03b",
                version, EBOX_VERSION,
            )
        if pkt_type != 0:
            raise ValueError(
                f"EBOX decoder got a TC packet (type={pkt_type}); "
                f"this decoder handles TM only"
            )
        if sub_hdr_flag != 1:
            raise ValueError(f"EBOX sub-header flag = {sub_hdr_flag}; ICD requires 1")
        if apid != EBOX_APID:
            raise ValueError(
                f"EBOX APID = 0x{apid:03X}; ICD specifies 0x{EBOX_APID:03X}"
            )

        # ── Packet boundaries ──────────────────────────────────────
        expected_total = MAIN_HDR_LEN + 1 + length_field
        if len(raw) < expected_total:
            raise ValueError(
                f"EBOX packet length field implies {expected_total} bytes "
                f"but only {len(raw)} are present"
            )

        checksum_offset = expected_total - 1
        checksum_rx = raw[checksum_offset]
        body = raw[:checksum_offset]

        checksum_calc = compute_ebox_checksum(body)
        crc_ok = checksum_calc == checksum_rx

        # ── Sub-header ─────────────────────────────────────────────
        sub_hdr_offset = MAIN_HDR_LEN
        sub_hdr_value = raw[sub_hdr_offset]
        sub_hdr_label = {
            0x01: "FAST_TM",
            0x02: "SLOW_TM",
        }.get(sub_hdr_value, f"UNKNOWN(0x{sub_hdr_value:02X})")

        # ── Effective data header ──────────────────────────────────
        eff_start = sub_hdr_offset + SUB_HDR_LEN_1BYTE
        unit_id = raw[eff_start + 0]
        unit_sub_id = raw[eff_start + 1]
        service = raw[eff_start + 2]
        subservice = raw[eff_start + 3]

        # ── Registry lookup on 4-tuple ─────────────────────────────
        reg = get_ebox_registry()
        spec = reg.lookup(unit_id, unit_sub_id, service, subservice)

        # ── Payload slice ──────────────────────────────────────────
        payload_start = eff_start + PAYLOAD_OFFSET_IN_EFFECTIVE
        payload_end = checksum_offset
        payload = raw[payload_start:payload_end]

        fields: dict[str, Any] = {}
        if spec:
            fields = self._extract_fields(payload, spec)

        # ── Metadata ───────────────────────────────────────────────
        if spec:
            subsystem = spec["subsystem"]
            card_label = spec["card_label"]
            card_key = spec["card"]
            hw_class = spec.get("hw_class", "HW")
        else:
            subsystem = "EBOX"
            card_label = (
                f"UNKNOWN("
                f"uid={unit_id:#04x},"
                f"sub={unit_sub_id:#04x},"
                f"svc={service:#04x},"
                f"ssub={subservice:#04x})"
            )
            card_key = "UNKNOWN"
            hw_class = "HW"

        return {
            "cc": 0x08,
            # Frontend keys everything off `apid`; for EBOX we expose
            # unit_sub_id as `apid` so the dropdown lookup matches
            # what /api/meta advertises.
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
            # ── EBOX extras ────────────────────────────────────────
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
        """
        Extract fields using YAML offsets.

        Two passes:
          1. Extract every field with a raw `value`.
          2. Post-process `calc:` fields (using the referenced raw field)
             and expand `bits:` sub-fields into `field.bitname` entries.
        """
        out: dict[str, Any] = {}
        raw_values: dict[str, float] = {}

        # ── Pass 1: raw extraction ────────────────────────────────
        for f in spec.get("fields", []):
            name = f["name"]
            off = f["offset"]
            typ = f["type"]
            size = TYPE_SIZE[typ]

            if off + size > len(payload):
                continue

            val = EboxDecoder._read_value(payload, off, typ)
            if typ in ("f32", "f64"):
                val = round(val, 4)

            raw_values[name] = val
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

        # ── Pass 2a: calc fields ──────────────────────────────────
        for f in spec.get("fields", []):
            if "calc" not in f:
                continue
            name = f["name"]
            src_name = f.get("calc_from")
            if src_name not in raw_values:
                continue
            D = raw_values[src_name]
            try:
                computed = apply_calc(f["calc"], int(D))
            except Exception:
                log.exception("calc failed for %s.%s", spec["card"], name)
                computed = None

            # Guard NaN / inf so JSON and React don't choke
            if isinstance(computed, float) and not math.isfinite(computed):
                computed = None

            out[name] = {
                "value": round(computed, 4) if isinstance(computed, float) else computed,
                "unit": f.get("unit", ""),
                "limits": [f.get("ltl"), f.get("htl")],
                "status": EboxDecoder._status(computed if computed is not None else 0, f),
                "enum": None,
            }

        # ── Pass 2b: bitfield sub-entries ─────────────────────────
        for f in spec.get("fields", []):
            if "bits" not in f:
                continue
            parent_name = f["name"]
            raw = int(raw_values.get(parent_name, 0))
            for b in f["bits"]:
                bname = b["name"]
                if "bit" in b:
                    bval = (raw >> b["bit"]) & 0x1
                elif "low" in b and "high" in b:
                    mask = ((1 << (b["high"] - b["low"] + 1)) - 1) << b["low"]
                    bval = (raw & mask) >> b["low"]
                else:
                    continue

                full_name = f"{parent_name}.{bname}"
                out[full_name] = {
                    "value": bval,
                    "unit": "",
                    "limits": [None, None],
                    "status": "OK",
                    "enum": b.get("enum"),
                }

        return out

    # ---------------------------------------------------------------- #
    @staticmethod
    def _read_value(payload: bytes, off: int, typ: str) -> float | int:
        """Read a value of the given type from payload[off:off+size]."""
        if typ == "u24":
            # u24 = 3 bytes big-endian
            b = payload[off:off + 3]
            return (b[0] << 16) | (b[1] << 8) | b[2]
        fmt = TYPE_FMT[typ]
        return struct.unpack_from(">" + fmt, payload, off)[0]

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