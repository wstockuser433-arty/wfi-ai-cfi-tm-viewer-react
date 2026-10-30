import asyncio
import logging
from typing import Any, Awaitable, Callable

from .tcp_source import TcpSource
from .udp_source import UdpSource
from .serial_source import SerialSource
from .serial_config import get_serial_config

log = logging.getLogger(__name__)

PacketCb = Callable[[bytes, float], Awaitable[None]]


class IngestionManager:
    def __init__(self, on_packet: PacketCb) -> None:
        self.on_packet = on_packet
        self.sources: list[Any] = []
        self.subscribers: set[asyncio.Queue] = set()
        self.writer: Any = None
        self._tcp: TcpSource | None = None
        self._udp: UdpSource | None = None
        self._serial: SerialSource | None = None

    # ------------------------------------------------------------------ #
    async def start_ethernet(self, host: str, tcp_port: int, udp_port: int) -> None:
        """Start TCP + UDP sources. Safe to call when already running."""
        if self._tcp is not None or self._udp is not None:
            log.info("Ethernet sources already active; ignoring start_ethernet")
            return

        self._tcp = TcpSource(host, tcp_port, self.on_packet)
        self._udp = UdpSource(host, udp_port, self.on_packet)
        self.sources.extend([self._tcp, self._udp])
        asyncio.create_task(self._run(self._tcp, f"TCP {host}:{tcp_port}"))
        asyncio.create_task(self._run(self._udp, f"UDP {host}:{udp_port}"))

    async def stop_ethernet(self) -> None:
        if self._tcp is not None:
            try:
                await self._tcp.stop()
            except Exception:
                log.exception("Error stopping TCP source")
            self._tcp = None
        if self._udp is not None:
            try:
                await self._udp.stop()
            except Exception:
                log.exception("Error stopping UDP source")
            self._udp = None
        self.sources = [s for s in self.sources if s not in (self._tcp, self._udp)]

    async def start_serial(self) -> None:
        if self._serial is not None:
            log.info("Serial source already active; ignoring start_serial")
            return
        self._serial = SerialSource(self.on_packet)
        self.sources.append(self._serial)
        asyncio.create_task(self._run(self._serial, "Serial (RS-422)"))

    async def stop_serial(self) -> None:
        if self._serial is not None:
            try:
                await self._serial.stop()
            except Exception:
                log.exception("Error stopping serial source")
            self._serial = None
        self.sources = [s for s in self.sources if s is not self._serial]

    # ------------------------------------------------------------------ #
    async def apply_transport(self, transport: str) -> None:
        """Switch between 'ethernet' and 'serial' modes at runtime."""
        try:
            if transport == "serial":
                await self.stop_ethernet()
                await self.start_serial()
            elif transport == "ethernet":
                await self.stop_serial()
                from ...config import settings
                await self.start_ethernet(
                    settings.tm_listen_host,
                    settings.tm_listen_port,
                    9200,
                )
            else:
                log.warning("Unknown transport %r; ignoring", transport)
                return
            log.info("Ingestion transport set to %s", transport)
        except Exception:
            log.exception("Failed to switch transport to %s", transport)

    # ------------------------------------------------------------------ #
    @staticmethod
    async def _run(source: Any, label: str) -> None:
        try:
            log.info("Starting source: %s", label)
            await source.start()
        except asyncio.CancelledError:
            raise
        except Exception:
            log.exception("Source %s crashed", label)

    async def stop(self) -> None:
        await self.stop_ethernet()
        await self.stop_serial()

    # ---- pub/sub (unchanged) ------------------------------------------ #
    def subscribe(self) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue(maxsize=500)
        self.subscribers.add(q)
        return q

    def unsubscribe(self, q: asyncio.Queue) -> None:
        self.subscribers.discard(q)

    async def broadcast(self, pkt) -> None:
        if not self.subscribers:
            return
        dead: list[asyncio.Queue] = []
        for q in self.subscribers:
            try:
                q.put_nowait(pkt)
            except asyncio.QueueFull:
                dead.append(q)
        for q in dead:
            self.subscribers.discard(q)