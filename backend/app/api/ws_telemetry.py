import asyncio
import json
from datetime import datetime
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from sqlalchemy import select
from ..db.postgres import SessionLocal
from ..db.models.packet import PacketRow
from ..tm_service.registry import get_registry
from ..tm_service.inspector.decoder import decode

router = APIRouter()


@router.websocket("/ws/telemetry")
async def ws_telemetry(ws: WebSocket):
    await ws.accept()
    from ..main import manager  # late import to avoid cycle
    if manager is None:
        await ws.close(code=1011, reason="ingestion not ready")
        return
    q = manager.subscribe()
    try:
        while True:
            pkt = await q.get()
            await ws.send_text(json.dumps({"t": pkt.timestamp, "packets": [pkt.model_dump()]}))
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
        await ws.send_text(json.dumps({"error": f"bad window: {e}"}))
        await ws.close()
        return

    reg = get_registry()
    async with SessionLocal() as db:
        stmt = select(PacketRow).where(PacketRow.ts >= t0, PacketRow.ts <= t1).order_by(PacketRow.ts)
        rows = (await db.execute(stmt)).scalars().all()

    prev = None
    for row in rows:
        if prev is not None:
            gap = (row.ts - prev).total_seconds() / max(speed, 0.001)
            if gap > 0:
                await asyncio.sleep(min(gap, 1.0))  # cap sleep so UI stays responsive
        prev = row.ts

        # Re-decode from stored raw hex (source of truth)
        pkt = decode(bytes.fromhex(row.raw_hex), row.ts.timestamp())
        await ws.send_text(json.dumps({"t": pkt["timestamp"], "packets": [pkt]}))

    await ws.send_text(json.dumps({"done": True}))
    await ws.close()