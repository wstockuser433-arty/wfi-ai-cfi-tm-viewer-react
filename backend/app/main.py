"""
WFI-AI-CFI TM Viewer — FastAPI application entrypoint.

Startup sequence (in lifespan):
  1. Create database tables
  2. Connect to Redis
  3. Create StorageWriter
  4. Create IngestionManager with an on_packet handler
  5. Start TCP source (port 9100)
  6. Start UDP source (port 9200)
  7. Spawn simulator (dev only)

Shutdown sequence (after yield):
  1. Stop all ingestion sources
"""

from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .db.postgres import SessionLocal, init_db
from .db.redis_client import get_redis
from .schemas.packet import DecodedPacket
from .tm_service.ingestion.manager import IngestionManager
from .tm_service.inspector.decoder import decode as decode_packet
from .tm_service.storage.writer import StorageWriter

# Routers
from .api.routes_meta import router as meta_router
from .api.routes_packets import router as packets_router
from .api.routes_history import router as history_router
from .api.routes_alarms import router as alarms_router
from .api.routes_upload import router as upload_router
from .api.routes_links import router as links_router
from .api.ws_telemetry import router as ws_router

import logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s — %(message)s",
)

log = logging.getLogger(__name__)

# Module-level so ws_telemetry.py can reach it via `from ..main import manager`
manager: IngestionManager | None = None


# ---------------------------------------------------------------------- #
# Packet handler — decode → store → fan-out
# ---------------------------------------------------------------------- #
async def on_packet(raw: bytes, ts: float) -> None:
    try:
        pkt_dict = decode_packet(raw, ts)
        pkt = DecodedPacket(**pkt_dict)
    except Exception:
        log.exception("Failed to decode packet (len=%d)", len(raw))
        return

    assert manager is not None

    try:
        await manager.writer.write_live(pkt)
    except Exception:
        log.exception("Redis write failed for apid=0x%X", pkt.apid)

    try:
        async with SessionLocal() as db:
            await manager.writer.write_playback(db, pkt)
            await db.commit()
    except Exception:
        log.exception("Postgres write failed for apid=0x%X", pkt.apid)

    try:
        await manager.broadcast(pkt)
    except Exception:
        log.exception("Broadcast failed for apid=0x%X", pkt.apid)


# ---------------------------------------------------------------------- #
# Lifespan — replace `@app.on_event("startup")`
# ---------------------------------------------------------------------- #
@asynccontextmanager
async def lifespan(app: FastAPI):
    global manager

    # ---- Startup -------------------------------------------------------
    log.info("==> Starting TM Viewer backend")

    log.info("[1/6] Initializing database …")
    await init_db()

    log.info("[2/6] Connecting to Redis …")
    redis = await get_redis()

    log.info("[3/6] Creating StorageWriter …")
    writer = StorageWriter(redis)

    log.info("[4/6] Creating IngestionManager …")
    manager = IngestionManager(on_packet)
    manager.writer = writer  # attach for on_packet access

    log.info("[5/6] Starting ingestion sources …")
    await manager.start_tcp(settings.tm_listen_host, settings.tm_listen_port)
    await manager.start_udp(settings.tm_listen_host, 9200)
    # Give the sockets a moment to actually bind before spawning the sim
    await asyncio.sleep(0.5)

    if settings.enable_sim:
        log.info("[6/6] Starting simulator at %.1f Hz …", settings.sim_rate_hz)
        from .sim.tcp_emitter import start_simulator
        asyncio.create_task(
            start_simulator(
                settings.tm_listen_host,
                settings.tm_listen_port,
                rate_hz=settings.sim_rate_hz,
            )
        )
        def _log_sim_crash(t: asyncio.Task):
            try:
                t.result()
            except asyncio.CancelledError:
                pass
            except Exception:
                log.exception("Simulator task crashed")

        sim_task = asyncio.create_task(start_simulator(settings.tm_listen_host,
                settings.tm_listen_port,
                rate_hz=settings.sim_rate_hz,))
        sim_task.add_done_callback(_log_sim_crash)
    else:
        log.info("[6/6] Simulator disabled (ENABLE_SIM=false)")

    log.info("==> Startup complete. Sources: TCP:%d, UDP:9200",
             settings.tm_listen_port)

    yield

    # ---- Shutdown ------------------------------------------------------
    log.info("==> Shutting down …")
    if manager is not None:
        await manager.stop()
    log.info("==> Shutdown complete")


# ---------------------------------------------------------------------- #
# App
# ---------------------------------------------------------------------- #
app = FastAPI(
    title="WFI-AI-CFI TM Viewer API",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(meta_router)
app.include_router(packets_router)
app.include_router(history_router)
app.include_router(alarms_router)
app.include_router(upload_router)
app.include_router(links_router)
app.include_router(ws_router)