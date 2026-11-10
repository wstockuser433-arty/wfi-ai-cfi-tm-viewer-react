import asyncio
import json
import uuid
from datetime import datetime
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from sqlalchemy import select
from ..config import settings
from ..db.postgres import SessionLocal
from ..db.models.packet import PacketRow
from ..tm_service.inspector.factory import get_decoder

router = APIRouter()

# ─── Chunking constants ────────────────────────────────────────────────
FIELDS_PER_CHUNK = 20   # ~1.5 KB per message — safe under any size limit


import math

def _clean_nan(obj):
    """
    Recursively replace NaN / Infinity with None so json.dumps
    produces valid JSON that the browser can parse.
    """
    if isinstance(obj, float):
        if math.isnan(obj) or math.isinf(obj):
            return None
        return obj
    if isinstance(obj, dict):
        return {k: _clean_nan(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_clean_nan(v) for v in obj]
    return obj


def _chunk_dict(d: dict, n: int):
    """Yield successive sub-dicts of at most n items."""
    items = list(d.items())
    for i in range(0, len(items), n):
        yield dict(items[i:i + n])


async def _send_packet_chunked(ws: WebSocket, pkt, ts: float) -> None:
    """
    Send one decoded packet as multiple small WS messages.

    Message flow:
      packet_begin → fields(0..N-1) → packet_end

    Each message is a complete, valid JSON object under 2 KB.
    Frontend reassembles by packet_id.
    """
    packet_id = uuid.uuid4().hex

    # ─── Message 1: metadata (no fields, no raw_hex yet) ──────────────
    dump = pkt.model_dump()
    fields = dump.pop("fields", {}) or {}
    raw_hex = dump.pop("raw_hex", "")
    payload = {
        "type": "packet_begin",
        "packet_id": packet_id,
        "t": ts,
        "packet": dump,   # everything except fields and raw_hex
    }

    await ws.send_text(json.dumps(_clean_nan(payload), allow_nan=False))

    # ─── Messages 2..N-1: fields in chunks of FIELDS_PER_CHUNK ────────
    part = 0
    for chunk in _chunk_dict(fields, FIELDS_PER_CHUNK):
        payload = {
            "type": "fields",
            "packet_id": packet_id,
            "part": part,
            "fields": chunk,
        }
        await ws.send_text(json.dumps(_clean_nan(payload), allow_nan=False))
        part += 1

    # ─── Message N: finalize with raw_hex ─────────────────────────────
    payload = {
        "type": "packet_end",
        "packet_id": packet_id,
        "t": ts,
        "raw_hex": raw_hex,
        "total_parts": part,
    }
    await ws.send_text(json.dumps(_clean_nan(payload), allow_nan=False))


@router.websocket("/ws/telemetry")
async def ws_telemetry(ws: WebSocket):
    await ws.accept()

    import sys
    main_mod = sys.modules["app.main"]
    await ws.send_text(json.dumps({
        "type": "init",
        "start_time": main_mod.START_TIME,
        "total_packets": main_mod.total_packets,
    }))
    
    from ..main import manager
    if manager is None:
        await ws.close(code=1011, reason="ingestion not ready")
        return

    q = manager.subscribe()
    try:
        while True:
            try:
                pkt = await q.get()
            except asyncio.CancelledError:
                break

            try:
                await _send_packet_chunked(ws, pkt, pkt.timestamp)
            except (RuntimeError, WebSocketDisconnect):
                # Socket was closed by the client mid-send — stop gracefully.
                # No log spam; this is expected on page refresh.
                break
            except Exception:
                # Genuine error — log once, don't spam.
                import logging
                logging.getLogger(__name__).warning(
                    "WS send error (once): %s", exc_info=True
                )
                break
    except WebSocketDisconnect:
        pass
    finally:
        manager.unsubscribe(q)


@router.websocket("/ws/playback")
async def ws_playback(
    ws: WebSocket,
    start: str = Query(...),
    end: str = Query(...),
    speed: float = Query(1.0),
):
    await ws.accept()
    try:
        t0 = datetime.fromisoformat(start)
        t1 = datetime.fromisoformat(end)
    except Exception as e:
        payload = {"error": f"bad window: {e}"}
        await ws.send_text(json.dumps(_clean_nan(payload), allow_nan=False))
        await ws.close()
        return

    decoder = get_decoder(settings.tm_decoder)

    async with SessionLocal() as db:
        stmt = (
            select(PacketRow)
            .where(PacketRow.ts >= t0, PacketRow.ts <= t1)
            .order_by(PacketRow.ts)
        )
        rows = (await db.execute(stmt)).scalars().all()

    prev = None
    for row in rows:
        if prev is not None:
            gap = (row.ts - prev).total_seconds() / max(speed, 0.001)
            if gap > 0:
                await asyncio.sleep(min(gap, 1.0))
        prev = row.ts

        pkt_dict = decoder.decode(bytes.fromhex(row.raw_hex), row.ts.timestamp())
        # Playback uses the same chunked protocol
        from ..schemas.packet import DecodedPacket
        pkt = DecodedPacket(**pkt_dict)
        await _send_packet_chunked(ws, pkt, pkt.timestamp)

    payload = {"type": "done"}
    await ws.send_text(json.dumps(_clean_nan(payload), allow_nan=False))
    await ws.close()