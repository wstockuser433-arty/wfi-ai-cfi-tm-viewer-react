"""
Persistent config for RS-422 serial ingestion.

Saved to backend/serial_config.json so it survives restarts. The user can
flip between Ethernet and Serial in the Settings drawer; the choice is
stored here too.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, asdict, field
from pathlib import Path
from typing import Literal

log = logging.getLogger(__name__)

CONFIG_PATH = Path(__file__).resolve().parents[3] / "serial_config.json"


TransportKind = Literal["ethernet", "serial"]


@dataclass
class SerialConfig:
    # Transport selection
    transport: TransportKind = "ethernet"

    # Serial parameters (per ICD: 115200 8N1)
    port: str = "/dev/ttyUSB0"
    baudrate: int = 115200
    bytesize: int = 8         # 5 | 6 | 7 | 8
    parity: str = "N"         # N | E | O | M | S
    stopbits: float = 1.0     # 1.0 | 1.5 | 2.0
    flow_control: str = "none"  # none | rtscts | xonxoff | dsrdtr
    timeout_s: float = 0.1
    read_chunk: int = 4096

    @classmethod
    def load(cls) -> "SerialConfig":
        """Load from disk, fall back to defaults."""
        if not CONFIG_PATH.exists():
            log.info("serial_config.json not found, using defaults at %s", CONFIG_PATH)
            return cls()
        try:
            data = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
            # Filter unknown keys so future additions don't break old configs
            known = {f.name for f in cls.__dataclass_fields__.values()}  # type: ignore[attr-defined]
            filtered = {k: v for k, v in data.items() if k in known}
            return cls(**filtered)
        except Exception:
            log.exception("Failed to load serial config — using defaults")
            return cls()

    def save(self) -> None:
        CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
        CONFIG_PATH.write_text(
            json.dumps(asdict(self), indent=2, sort_keys=True),
            encoding="utf-8",
        )
        log.info("serial_config.json saved (%s mode, port=%s)",
                 self.transport, self.port)

    def validate(self) -> list[str]:
        """Return a list of validation errors, empty if valid."""
        errs: list[str] = []
        if self.transport not in ("ethernet", "serial"):
            errs.append(f"transport must be 'ethernet' or 'serial', got {self.transport!r}")
        if not (300 <= self.baudrate <= 4_000_000):
            errs.append(f"baudrate {self.baudrate} out of range 300..4000000")
        if self.bytesize not in (5, 6, 7, 8):
            errs.append(f"bytesize {self.bytesize} must be 5, 6, 7, or 8")
        if self.parity not in ("N", "E", "O", "M", "S"):
            errs.append(f"parity {self.parity!r} must be one of N, E, O, M, S")
        if self.stopbits not in (1.0, 1.5, 2.0):
            errs.append(f"stopbits {self.stopbits} must be 1.0, 1.5, or 2.0")
        if self.flow_control not in ("none", "rtscts", "xonxoff", "dsrdtr"):
            errs.append(f"flow_control {self.flow_control!r} invalid")
        if not (0.01 <= self.timeout_s <= 10.0):
            errs.append(f"timeout_s {self.timeout_s} out of range 0.01..10")
        return errs


_current: SerialConfig | None = None


def get_serial_config() -> SerialConfig:
    global _current
    if _current is None:
        _current = SerialConfig.load()
    return _current


def set_serial_config(cfg: SerialConfig) -> None:
    global _current
    _current = cfg
    cfg.save()