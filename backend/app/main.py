from __future__ import annotations

import asyncio
import logging
import time
from contextlib import asynccontextmanager

from .logging_config import setup_logging
setup_logging()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .db.postgres import SessionLocal, init_db
from .db.redis_client import get_redis
from .schemas.packet import DecodedPacket
from .tm_service.ingestion.manager import IngestionManager
from .tm_service.inspector.factory import get_decoder
from .tm_service.storage.writer import StorageWriter

from .api.routes_meta import router as meta_router
from .api.routes_packets import router as packets_router
from .api.routes_history import router as history_router
from .api.routes_alarms import router as alarms_router
from .api.routes_upload import router as upload_router
from .api.routes_links import router as links_router
from .api.routes_logs import router as logs_router
from .api.routes_settings import router as settings_router
from .api.ws_telemetry import router as ws_router
from .api.ws_logs import router as ws_logs_router

log = logging.getLogger(__name__)

manager: IngestionManager | None = None
decoder = None

START_TIME = time.time()
total_packets = 0

# ---------------------------------------------------------------------- #
# Packet handler — decode → store → fan-out
# ---------------------------------------------------------------------- #
async def on_packet(raw: bytes, ts: float) -> None:
    global decoder, total_packets
    log.info("on_packet: got %d bytes", len(raw))
    if decoder is None:
        log.error("Decoder not initialized; dropping packet")
        return

    try:
        pkt_dict = decoder.decode(raw, ts)
        pkt = DecodedPacket(**pkt_dict)
    except Exception:
        log.exception("Failed to decode packet (len=%d)", len(raw))
        return

    total_packets += 1 
    
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
# Lifespan — .env is the source of truth for transport
# ---------------------------------------------------------------------- #
@asynccontextmanager
async def lifespan(app: FastAPI):
    global manager, decoder

    log.info("==> Starting TM Viewer backend")

    # ─── [1/6] DB ───────────────────────────────────────────────────
    log.info("[1/6] Initializing database …")
    await init_db()

    # ─── [2/6] Redis ────────────────────────────────────────────────
    log.info("[2/6] Connecting to Redis …")
    redis = await get_redis()

    # ─── [3/6] StorageWriter + Decoder ──────────────────────────────
    log.info("[3/6] Creating StorageWriter + Decoder (mode=%s) …",
             settings.tm_decoder)
    writer = StorageWriter(redis)
    decoder = get_decoder(settings.tm_decoder)

    if settings.tm_decoder.lower() == "ebox":
        from .tm_service.registry_ebox import get_ebox_registry
        log.info("     Preloading EBOX registry (YAML validation) …")
        reg = get_ebox_registry()
        log.info(
            "     EBOX registry ready: %d cards, %d unique 4-tuples",
            len(reg.cards), len(reg.quad_map),
        )

    # ─── [4/6] IngestionManager ─────────────────────────────────────
    log.info("[4/6] Creating IngestionManager …")
    manager = IngestionManager(on_packet)
    manager.writer = writer

    # ─── [5/6] Ingestion sources — driven entirely by .env ──────────
    log.info("[5/6] Starting ingestion sources (per .env) …")

    started: list[str] = []

    if settings.serial_enabled:
        # Serial-only mode. If you need serial+ethernet simultaneously,
        # remove the `else` below and keep both blocks.
        log.info("[5/6] SERIAL_ENABLED=true → starting SERIAL source")
        log.info("       port=%s baud=%d",
                 settings.serial_port, settings.serial_baud)

        # The serial source must be told which port/baud to open.
        # Adjust the kwargs to whatever IngestionManager.start_serial expects;
        # the important thing is that they come from `settings`, not from a
        # separate JSON config file.
        await manager.start_serial(
            port=settings.serial_port,
            baudrate=settings.serial_baud,
        )
        started.append(f"SERIAL {settings.serial_port}@{settings.serial_baud}")

    else:
        # Ethernet mode — start TCP and UDP, each on its own port.
        log.info("[5/6] SERIAL_ENABLED=false → starting ETHERNET sources")
        log.info("       TCP %s:%d",
                 settings.tm_listen_host, settings.tm_listen_port)
        log.info("       UDP %s:%d",
                 settings.tm_listen_host, settings.tm_udp_port)

        await manager.start_ethernet(
            host=settings.tm_listen_host,
            tcp_port=settings.tm_listen_port,
            udp_port=settings.tm_udp_port,
        )
        started.append(f"TCP {settings.tm_listen_host}:{settings.tm_listen_port}")
        started.append(f"UDP {settings.tm_listen_host}:{settings.tm_udp_port}")

    await asyncio.sleep(0.5)

    # ─── [6/6] Simulator ────────────────────────────────────────────
    sim_task = None
    if settings.enable_sim:
        log.info("[6/6] Starting simulator at %.1f Hz …", settings.sim_rate_hz)
        from .sim.tcp_emitter import start_simulator

        def _log_sim_crash(t: asyncio.Task):
            try:
                t.result()
            except asyncio.CancelledError:
                pass
            except Exception:
                log.exception("Simulator task crashed")

        sim_task = asyncio.create_task(
            start_simulator(
                settings.tm_listen_host,
                settings.tm_listen_port,
                rate_hz=settings.sim_rate_hz,
            )
        )
        sim_task.add_done_callback(_log_sim_crash)
    else:
        log.info("[6/6] Simulator disabled (ENABLE_SIM=false)")

    log.info("==> Startup complete. Sources: %s, decoder=%s",
             ", ".join(started) or "<none>", settings.tm_decoder)

    try:
        yield
    finally:
        log.info("==> Shutting down …")
        if sim_task is not None and not sim_task.done():
            sim_task.cancel()
            try:
                await sim_task
            except asyncio.CancelledError:
                pass
        if manager is not None:
            await manager.stop()
        log.info("==> Shutdown complete")


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

app.include_router(meta_router)
app.include_router(packets_router)
app.include_router(history_router)
app.include_router(alarms_router)
app.include_router(upload_router)
app.include_router(links_router)
app.include_router(ws_router)
app.include_router(ws_logs_router)
app.include_router(logs_router)
app.include_router(settings_router)