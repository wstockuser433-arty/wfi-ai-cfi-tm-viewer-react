import os
DEBUG_PACKET_BUILD = os.getenv("DEBUG_PACKET_BUILD", "false").lower() == "true"

import struct
import time
from typing import Any

from ..tm_service.registry import get_registry
from ..tm_service.inspector.crc import crc16_ccitt
from .spacecraft_model import SimState

# struct format chars
TYPE_FMT: dict[str, str] = {
    "f32": "f", "f64": "d",
    "u8": "B", "u16": "H", "u32": "I",
    "i8": "b", "i16": "h", "i32": "i",
}

# Which Python types each struct code accepts
INT_TYPES = {"u8", "u16", "u32", "i8", "i16", "i32"}
FLOAT_TYPES = {"f32", "f64"}


def _coerce(value: Any, tm_type: str) -> Any:
    """
    Coerce a Python value to the exact type struct.pack expects.
    Handles numpy scalars, bools, None, strings, and float→int conversion.
    """
    if value is None:
        value = 0

    # numpy scalars expose .item() — pull out the native Python type
    if hasattr(value, "item") and not isinstance(value, (int, float, bool)):
        try:
            value = value.item()
        except Exception:
            pass

    if tm_type in INT_TYPES:
        # Round then cast — safer than truncation for values like 3.9999
        try:
            return int(round(float(value)))
        except (TypeError, ValueError):
            return 0

    if tm_type in FLOAT_TYPES:
        try:
            return float(value)
        except (TypeError, ValueError):
            return 0.0

    # Unknown type — let struct raise a clear error upstream
    return value


def build_all(state: SimState) -> list[bytes]:
    reg = get_registry()
    frames: list[bytes] = []
    for apid, spec in reg.apid_map.items():
        frames.append(_build(apid, spec["fields"], _values_for(state, spec)))
    return frames


def _values_for(state: SimState, spec: dict) -> dict[str, Any]:
    """
    Pull attribute names from state by field name; fall back to 0.
    Also honors spec-level defaults if present.
    """
    out: dict[str, Any] = {}
    for f in spec["fields"]:
        out[f["name"]] = getattr(state, f["name"], f.get("default", 0))
    return out


def _build(apid: int, fields: list[dict], values: dict[str, Any]) -> bytes:
    # Compute the maximum byte span so we can pre-size the payload buffer
    max_end = 0
    if DEBUG_PACKET_BUILD:
        for f in fields:
            v = values.get(f["name"])
            print(f"apid=0x{apid:X} {f['name']:30s} type={f['type']:4s} "
                f"value={v!r} pytype={type(v).__name__}")

    for f in fields:
        end = f["offset"] + _size(f["type"])
        if end > max_end:
            max_end = end

    payload = bytearray(max_end)

    for f in fields:
        raw = values.get(f["name"], 0)
        coerced = _coerce(raw, f["type"])

        try:
            struct.pack_into(">" + TYPE_FMT[f["type"]], payload, f["offset"], coerced)
        except struct.error as e:
            raise ValueError(
                f"pack failed for apid=0x{apid:X} field={f['name']} "
                f"type={f['type']} offset={f['offset']} value={raw!r}"
            ) from e

    length = len(payload) - 1
    seq = int(time.time() * 10) & 0x3FFF
    header = struct.pack(">BHHH", 0x08, apid | 0xC000, seq | 0xC000, length)
    crc = crc16_ccitt(header + payload)
    return header + bytes(payload) + struct.pack(">H", crc)


def _size(t: str) -> int:
    return {"f32": 4, "f64": 8, "u8": 1, "u16": 2, "u32": 4,
            "i8": 1, "i16": 2, "i32": 4}[t]