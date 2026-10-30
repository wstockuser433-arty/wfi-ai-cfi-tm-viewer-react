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
from .serial_config import get_serial_config

log = logging.getLogger(__name__)


class SerialSource(AbstractTmSource):
    def __init__(self, sink: PacketSink):
        super().__init__(sink)
        self._reader: asyncio.StreamReader | None = None
        self._transport = None
        self._task: asyncio.Task | None = None

    async def start(self) -> None:
        self._running = True
        cfg = get_serial_config()

        try:
            import serial_asyncio  # pyserial-asyncio
        except ImportError as e:
            log.error(
                "pyserial-asyncio not installed — serial ingestion disabled. "
                "Run `pip install pyserial-asyncio`. (%s)", e,
            )
            return

        # Map string flow control to pyserial kwargs
        flow = cfg.flow_control
        rtscts = flow == "rtscts"
        xonxoff = flow == "xonxoff"
        dsrdtr = flow == "dsrdtr"

        try:
            self._reader, self._transport = await serial_asyncio.open_serial_connection(
                url=cfg.port,
                baudrate=cfg.baudrate,
                bytesize=cfg.bytesize,
                parity=cfg.parity,
                stopbits=cfg.stopbits,
                rtscts=rtscts,
                xonxoff=xonxoff,
                dsrdtr=dsrdtr,
                timeout=cfg.timeout_s,
            )
        except Exception as e:
            log.exception("Failed to open serial port %s: %s", cfg.port, e)
            return

        log.info(
            "Serial source listening on %s (%d %d%s%s, flow=%s)",
            cfg.port, cfg.baudrate, cfg.bytesize, cfg.parity,
            cfg.stopbits, flow,
        )

        self._task = asyncio.create_task(self._read_loop())

    async def _read_loop(self) -> None:
        cfg = get_serial_config()
        assert self._reader is not None
        while self._running:
            try:
                chunk = await self._reader.read(cfg.read_chunk)
                if not chunk:
                    await asyncio.sleep(0.05)
                    continue
                await self._emit(bytes(chunk), time.time())
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