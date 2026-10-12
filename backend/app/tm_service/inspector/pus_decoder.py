import struct
from typing import Any

from spacepackets.ecss.tm import PusTelemetry

from .base import PacketDecoder
from .custom_decoder import CustomDecoder
from ..registry import get_registry
from ...config import settings

TYPE_FMT = {"f32": "f", "f64": "d", "u8": "B", "u16": "H", "u32": "I",
            "i8": "b", "i16": "h", "i32": "i"}
TYPE_SIZE = {"f32": 4, "f64": 8, "u8": 1, "u16": 2, "u32": 4,
             "i8": 1, "i16": 2, "i32": 4}


class PusDecoder(PacketDecoder):
    """
    ECSS PUS-C telemetry decoder (backed by the `spacepackets` library).

    Parses CCSDS primary header + PUS secondary header, exposing:
      - service_type / service_subtype
      - packet subcounter
      - timestamp (if present in the PUS-C secondary header)
      - user data (application payload)

    User-data fields are still extracted by offset from parameters.yaml,
    because PUS user data is application-defined — the framework stays
    constant, the content varies.
    """

    def decode(self, raw: bytes, timestamp: float) -> dict[str, Any]:
        tm = PusTelemetry.unpack(data=raw, timestamp_len=settings.tm_pus_timestamp_len)

        reg = get_registry()
        spec = reg.lookup(tm.apid)
        fields = self._extract_user_data(tm.tm_data, spec)   # ← changed

        return {
            "cc": 0x08,
            "apid": tm.apid,
            "apid_name": spec["card_label"] if spec else "UNKNOWN",
            "subsystem": spec["subsystem"] if spec else "UNKNOWN",
            "card": spec["card"] if spec else "UNKNOWN",
            "hw_class": spec.get("hw_class", "HW") if spec else "HW",
            "seq": tm.seq_count,
            "length": len(tm.tm_data),                       # ← changed
            "crc_ok": True,
            "payload_hex": tm.tm_data.hex(),                 # ← changed
            "raw_hex": raw.hex(),
            "fields": fields,
            "timestamp": timestamp,
            "service_type": tm.service,
            "service_subtype": tm.subservice,
        }

    def _extract_user_data(self, user_data: bytes, spec: dict | None) -> dict[str, Any]:
        """YAML-offset extraction from the PUS user_data field."""
        fields: dict[str, Any] = {}
        if not spec:
            return fields

        for f in spec["fields"]:
            off, typ, name = f["offset"], f["type"], f["name"]
            size = TYPE_SIZE[typ]
            if off + size > len(user_data):
                continue
            val = struct.unpack_from(">" + TYPE_FMT[typ], user_data, off)[0]
            if typ in ("f32", "f64"):
                val = round(val, 4)
            status = CustomDecoder._status(val, f)
            enum_norm = None
            if f.get("enum"):
                enum_norm = {str(k): str(v) for k, v in f["enum"].items()}
            fields[name] = {
                "value": val,
                "unit": f.get("unit", ""),
                "limits": [f.get("ltl"), f.get("htl")],
                "status": status,
                "enum": enum_norm,
            }
        return fields