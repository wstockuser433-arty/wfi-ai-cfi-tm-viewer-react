import struct
from typing import Any

from .ccsds import parse_ccsds_header, CCSDS_HEADER_LEN
from .crc import crc16_ccitt
from ..registry import get_registry

TYPE_FMT = {"f32": "f", "f64": "d", "u8": "B", "u16": "H", "u32": "I",
            "i8": "b", "i16": "h", "i32": "i"}
TYPE_SIZE = {"f32": 4, "f64": 8, "u8": 1, "u16": 2, "u32": 4,
             "i8": 1, "i16": 2, "i32": 4}


def decode(raw: bytes, timestamp: float) -> dict[str, Any]:
    hdr = parse_ccsds_header(raw)
    reg = get_registry()
    spec = reg.lookup(hdr.apid)

    payload_start = CCSDS_HEADER_LEN
    payload_end = CCSDS_HEADER_LEN + hdr.length + 1
    payload = raw[payload_start:payload_end]

    crc_rx = struct.unpack(">H", raw[payload_end:payload_end + 2])[0]
    crc_ok = crc16_ccitt(raw[:payload_end]) == crc_rx

    fields: dict[str, Any] = {}
    if spec:
        for f in spec["fields"]:
            off, typ, name = f["offset"], f["type"], f["name"]
            size = TYPE_SIZE[typ]
            if off + size > len(payload):
                continue

            val = struct.unpack_from(">" + TYPE_FMT[typ], payload, off)[0]
            if typ in ("f32", "f64"):
                val = round(val, 4)

            status = _status(val, f)

            # ---- Normalize enum keys to strings (Pydantic-compatible) ----
            enum_norm: dict[str, str] | None = None
            if f.get("enum"):
                enum_norm = {str(k): str(v) for k, v in f["enum"].items()}

            fields[name] = {
                "value": val,
                "unit": f.get("unit", ""),
                "limits": [f.get("ltl"), f.get("htl")],
                "status": status,
                "enum": enum_norm,
            }

    return {
        "cc": hdr.cc,
        "apid": hdr.apid,
        "apid_name": spec["card_label"] if spec else "UNKNOWN",
        "subsystem": spec["subsystem"] if spec else "UNKNOWN",
        "card": spec["card"] if spec else "UNKNOWN",
        "hw_class": spec.get("hw_class", "HW") if spec else "HW",
        "seq": hdr.seq_count,
        "length": hdr.length,
        "crc_ok": crc_ok,
        "payload_hex": payload.hex(),
        "raw_hex": raw.hex(),
        "fields": fields,
        "timestamp": timestamp,
    }


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