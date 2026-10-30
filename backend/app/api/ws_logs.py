"""
WebSocket endpoint that streams live log entries to the UI.

- On connect: sends the last 200 buffered entries for context
- Then streams every new log record until disconnect

Attached to /ws/logs.
"""

import asyncio
import json
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from ..logging_config import get_recent_logs, subscriber_registry

router = APIRouter()
log = logging.getLogger(__name__)


@router.websocket("/ws/logs")
async def ws_logs(ws: WebSocket):
    await ws.accept()

    # Backlog
    try:
        backlog = get_recent_logs(200)
        await ws.send_text(json.dumps({"type": "backlog", "entries": backlog}))
    except Exception:
        log.exception("Failed to send log backlog")

    # Subscribe to new entries
    q: asyncio.Queue = asyncio.Queue(maxsize=500)
    subscriber_registry.add(q)
    try:
        while True:
            entry = await q.get()
            await ws.send_text(json.dumps({"type": "entry", "entry": entry}))
    except WebSocketDisconnect:
        pass
    except Exception:
        log.exception("ws_logs crashed")
    finally:
        subscriber_registry.remove(q)