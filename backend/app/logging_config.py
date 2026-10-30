"""
Logging configuration for the TM Viewer backend.

- All log records go to stderr (for the uvicorn terminal)
- All log records also go to a rotating file at backend/logs/tm-viewer.log
- Records also enter an in-memory ring buffer, which the /ws/logs WebSocket
  streams to any browser attached to the Logs popup
"""

from __future__ import annotations

import logging
import logging.handlers
from collections import deque
from pathlib import Path
from threading import Lock
from typing import Any

LOG_DIR = Path(__file__).resolve().parent.parent / "logs"
LOG_FILE = LOG_DIR / "tm-viewer.log"

RING_SIZE = 5000         # last N records kept in memory
_log_ring: deque[dict[str, Any]] = deque(maxlen=RING_SIZE)
_ring_lock = Lock()
_subscribers: list[asyncio_queue_like] = []  # populated lazily


# A sentinel callable — we'll swap for asyncio.Queue when the WS endpoint
# is first invoked, avoiding an import cycle with the event loop.
class _SubscriberRegistry:
    def __init__(self) -> None:
        self.subscribers: list[Any] = []

    def add(self, q: Any) -> None:
        self.subscribers.append(q)

    def remove(self, q: Any) -> None:
        try:
            self.subscribers.remove(q)
        except ValueError:
            pass


subscriber_registry = _SubscriberRegistry()


class RingBufferHandler(logging.Handler):
    """Push every record into the in-memory ring + fan out to WS subscribers."""

    def emit(self, record: logging.LogRecord) -> None:
        try:
            entry = {
                "ts": record.created,
                "level": record.levelname,
                "logger": record.name,
                "message": record.getMessage(),
            }
            with _ring_lock:
                _log_ring.append(entry)
            # Fan out to any WS subscribers
            for q in list(subscriber_registry.subscribers):
                try:
                    q.put_nowait(entry)
                except Exception:
                    pass
        except Exception:
            self.handleError(record)


def get_recent_logs(n: int = 200) -> list[dict[str, Any]]:
    with _ring_lock:
        items = list(_log_ring)
    return items[-n:]


def setup_logging() -> None:
    LOG_DIR.mkdir(parents=True, exist_ok=True)

    root = logging.getLogger()
    # Remove any pre-existing handlers to avoid duplicate output
    for h in list(root.handlers):
        root.removeHandler(h)

    root.setLevel(logging.INFO)

    fmt = logging.Formatter(
        "%(asctime)s %(levelname)s %(name)s — %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    # Console
    stream = logging.StreamHandler()
    stream.setFormatter(fmt)
    root.addHandler(stream)

    # Rotating file: 10 MB × 5 backups = 50 MB max
    file_h = logging.handlers.RotatingFileHandler(
        LOG_FILE, maxBytes=10 * 1024 * 1024, backupCount=5, encoding="utf-8",
    )
    file_h.setFormatter(fmt)
    root.addHandler(file_h)

    # Ring buffer + live fanout
    ring = RingBufferHandler()
    root.addHandler(ring)

    logging.getLogger(__name__).info(
        "Logging initialized — console + %s (10 MB × 5 backups) + ring buffer",
        LOG_FILE,
    )