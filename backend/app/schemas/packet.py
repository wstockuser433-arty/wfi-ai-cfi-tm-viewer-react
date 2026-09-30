from pydantic import BaseModel
from typing import Any


class DecodedField(BaseModel):
    value: Any
    unit: str = ""
    limits: list[float | None] = [None, None]
    status: str = "OK"
    enum: dict[int | str, str] | None = None


class DecodedPacket(BaseModel):
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

    def model_dump_json_safe(self) -> str:
        return self.model_dump_json()