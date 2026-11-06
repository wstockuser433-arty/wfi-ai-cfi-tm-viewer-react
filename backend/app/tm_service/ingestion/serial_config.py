"""
Persistent **runtime status** for the RS-422 serial source.

The *configuration* (port, baud, transport) now lives in `.env` and is
read via `app.config.Settings`. This file is only used to remember
whether the port is currently open and what the last error was, so the
Settings drawer can show status across restarts.

Do not put port/baud/transport here. They belong in `.env`.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, asdict
from pathlib import Path

log = logging.getLogger(__name__)

CONFIG_PATH = Path(__file__).resolve().parents[3] / "serial_status.json"


@dataclass
class SerialStatus:
    status: str = "idle"                    # idle | open | error
    last_error: str | None = None
    last_error_at: float | None = None
    port: str | None = None                 # last successfully opened port
    baudrate: int | None = None             # last successfully opened baud

    @classmethod
    def load(cls) -> "SerialStatus":
        if not CONFIG_PATH.exists():
            return cls()
        try:
            data = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
            known = {f.name for f in cls.__dataclass_fields__.values()}
            return cls(**{k: v for k, v in data.items() if k in known})
        except Exception:
            log.exception("Failed to load serial status — using defaults")
            return cls()

    def save(self) -> None:
        CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
        CONFIG_PATH.write_text(
            json.dumps(asdict(self), indent=2, sort_keys=True),
            encoding="utf-8",
        )


_status: SerialStatus | None = None


def get_serial_status() -> SerialStatus:
    global _status
    if _status is None:
        _status = SerialStatus.load()
    return _status