from pydantic import BaseModel, ConfigDict
from typing import Any


class DecodedField(BaseModel):
    value: Any
    unit: str = ""
    limits: list[float | None] = [None, None]
    status: str = "OK"
    enum: dict[int | str, str] | None = None


class DecodedPacket(BaseModel):
    # ─── Core ──────────────────────────────────────────────────
    cc: int
    apid: int
    apid_name: str
    subsystem: str
    card: str
    hw_class: str
    seq: int
    length: int
    crc_ok: bool
    payload_hex: str
    raw_hex: str
    fields: dict[str, DecodedField]
    timestamp: float

    # ─── PUS-specific (optional) ───────────────────────────────
    service_type: int | None = None
    service_subtype: int | None = None

    # ─── EBOX-specific (optional) ──────────────────────────────
    unit_id: int | None = None
    unit_sub_id: int | None = None
    sub_hdr_value: int | None = None
    sub_hdr_label: str | None = None
    seq_flags: int | None = None

    # Tolerate extra keys emitted by future decoders
    model_config = ConfigDict(extra="ignore")

    def model_dump_json_safe(self) -> str:
        return self.model_dump_json()