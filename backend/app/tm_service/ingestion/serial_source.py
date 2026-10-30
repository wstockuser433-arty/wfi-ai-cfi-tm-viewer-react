"""
RS-422 Serial Ingestion Source

Wraps a serial port (physical RS-422 USB adapter, or a socat PTY pair during
development) and feeds raw bytes to the ingestion manager, which runs them
through the same depacketizer pipeline as Ethernet.

Physical wiring (production):
    /dev/ttyUSB0  →  RS-422 transceiver  →  CTPU

Development (socat loopback):
    socat -d -d pty,raw,echo=0,link=/tmp/ttyV0 \
               pty,raw,echo=0,link=/tmp/ttyV1
    source: /tmp/ttyV1
    sink:   /tmp/ttyV0  (fed by send_ebox_tm.sh)
"""

from __future__ import annotations

import asyncio
import logging
import time

from .base import AbstractTmSource, PacketSink
from .format_map import header_len_for
from .depacketizer import StreamDepacketizer
from .rs422_framer import Rs422Framer
from .serial_config import get_serial_config
from ...config import settings

log = logging.getLogger(__name__)


class SerialSource(AbstractTmSource):
    def __init__(self, sink: PacketSink):
        super().__init__(sink)
        self._reader = None
        self._transport = None
        self._task: asyncio.Task | None = None

        # Same framer selection logic as TCP/UDP
        self._is_ebox = settings.tm_decoder.lower() == "ebox"
        self._header_len = header_len_for(settings.tm_decoder)

    async def start(self) -> None:
        self._running = True
        cfg = get_serial_config()

        try:
            import serial_asyncio
        except ImportError as e:
            log.error("pyserial-asyncio not installed: %s", e)
            return

        flow = cfg.flow_control
        try:
            self._reader, self._transport = await serial_asyncio.open_serial_connection(
                url=cfg.port,
                baudrate=cfg.baudrate,
                bytesize=cfg.bytesize,
                parity=cfg.parity,
                stopbits=cfg.stopbits,
                rtscts=(flow == "rtscts"),
                xonxoff=(flow == "xonxoff"),
                dsrdtr=(flow == "dsrdtr"),
                timeout=cfg.timeout_s,
            )
            cfg.status = "open"
            cfg.last_error = None
            cfg.last_error_at = None
            cfg.save()
            log.info("Serial source listening on %s (%d %d%s%s)",
                     cfg.port, cfg.baudrate, cfg.bytesize, cfg.parity, cfg.stopbits)
        except Exception as e:
            cfg.status = "error"
            cfg.last_error = str(e)
            cfg.last_error_at = time.time()
            cfg.save()
            log.error("Failed to open serial port %s: %s", cfg.port, e)
            return

        self._task = asyncio.create_task(self._read_loop())

    async def _read_loop(self) -> None:
        cfg = get_serial_config()

        # ⭐ Set up the correct framer/depacketizer for the current mode
        if self._is_ebox:
            framer = Rs422Framer()
            depkt = None
        else:
            framer = None
            depkt = StreamDepacketizer(header_len=self._header_len)

        assert self._reader is not None
        while self._running:
            try:
                chunk = await self._reader.read(cfg.read_chunk)
                if not chunk:
                    await asyncio.sleep(0.05)
                    continue

                # ⭐ Feed through the framer — do NOT emit raw chunks
                if self._is_ebox:
                    packets = framer.feed(bytes(chunk))
                else:
                    packets = depkt.feed(bytes(chunk))

                for pkt in packets:
                    try:
                        await self._emit(pkt, time.time())
                    except Exception:
                        log.exception("Sink failed for serial frame")

                for pkt in packets:
                    log.debug("Serial frame: %d bytes (hex: %s)", len(pkt), pkt.hex())
                    await self._emit(pkt, time.time())

            except asyncio.CancelledError:
                raise
            except Exception:
                log.exception("Serial read error")
                await asyncio.sleep(0.5)

    async def stop(self) -> None:
        self._running = False
        if self._task is not None:
            self._task.cancel()
            try:
                await self._task
            except (asyncio.CancelledError, Exception):
                pass
            self._task = None
        if self._transport is not None:
            try:
                self._transport.close()
            except Exception:
                pass
            self._transport = None
        log.info("Serial source stopped")