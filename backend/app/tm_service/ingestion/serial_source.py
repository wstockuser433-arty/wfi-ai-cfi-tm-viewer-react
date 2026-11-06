"""
RS-422 Serial Ingestion Source

Reads raw bytes from a serial port (physical RS-422 adapter, or a socat PTY
pair during development) and feeds framed packets to the ingestion manager.

Connection parameters (port, baudrate, etc.) are supplied at construction
time — they come from `.env` via app.config.Settings, NOT from
serial_config.py.
"""

from __future__ import annotations

import asyncio
import logging
import time

from .base import AbstractTmSource, PacketSink
from .format_map import header_len_for
from .depacketizer import StreamDepacketizer
from .rs422_framer import Rs422Framer
from .serial_config import get_serial_status
from ...config import settings

log = logging.getLogger(__name__)


class SerialSource(AbstractTmSource):
    def __init__(
        self,
        sink: PacketSink,
        port: str,
        baudrate: int,
        bytesize: int = 8,
        parity: str = "N",
        stopbits: float = 1.0,
        flow_control: str = "none",
        timeout_s: float = 0.1,
        read_chunk: int = 4096,
    ):
        super().__init__(sink)
        self._port = port
        self._baudrate = baudrate
        self._bytesize = bytesize
        self._parity = parity
        self._stopbits = stopbits
        self._flow_control = flow_control
        self._timeout_s = timeout_s
        self._read_chunk = read_chunk

        self._reader = None
        self._transport = None
        self._task: asyncio.Task | None = None

        self._is_ebox = settings.tm_decoder.lower() == "ebox"
        self._header_len = header_len_for(settings.tm_decoder)

    async def start(self) -> None:
        self._running = True
        status = get_serial_status()

        try:
            import serial_asyncio
        except ImportError as e:
            log.error("pyserial-asyncio not installed: %s", e)
            status.status = "error"
            status.last_error = f"pyserial-asyncio not installed: {e}"
            status.last_error_at = time.time()
            status.save()
            return

        try:
            self._reader, self._transport = await serial_asyncio.open_serial_connection(
                url=self._port,
                baudrate=self._baudrate,
                bytesize=self._bytesize,
                parity=self._parity,
                stopbits=self._stopbits,
                rtscts=(self._flow_control == "rtscts"),
                xonxoff=(self._flow_control == "xonxoff"),
                dsrdtr=(self._flow_control == "dsrdtr"),
                timeout=self._timeout_s,
            )
            status.status = "open"
            status.last_error = None
            status.last_error_at = None
            status.port = self._port
            status.baudrate = self._baudrate
            status.save()
            log.info(
                "Serial source listening on %s (%d %d%s%s)",
                self._port, self._baudrate,
                self._bytesize, self._parity, self._stopbits,
            )
        except Exception as e:
            status.status = "error"
            status.last_error = str(e)
            status.last_error_at = time.time()
            status.port = self._port
            status.baudrate = self._baudrate
            status.save()
            log.error("Failed to open serial port %s: %s", self._port, e)
            return

        self._task = asyncio.create_task(self._read_loop())

    async def _read_loop(self) -> None:
        if self._is_ebox:
            framer = Rs422Framer()
            depkt = None
        else:
            framer = None
            depkt = StreamDepacketizer(header_len=self._header_len)

        assert self._reader is not None
        while self._running:
            try:
                chunk = await self._reader.read(self._read_chunk)
                if not chunk:
                    await asyncio.sleep(0.05)
                    continue

                packets = (
                    framer.feed(bytes(chunk))
                    if self._is_ebox
                    else depkt.feed(bytes(chunk))
                )

                for pkt in packets:
                    try:
                        await self._emit(pkt, time.time())
                    except Exception:
                        log.exception("Sink failed for serial frame")

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

        status = get_serial_status()
        status.status = "idle"
        status.save()
        log.info("Serial source stopped")