import asyncio
import logging
from typing import Any, Awaitable, Callable

from .tcp_source import TcpSource
from .udp_source import UdpSource

log = logging.getLogger(__name__)

PacketCb = Callable[[bytes, float], Awaitable[None]]


class IngestionManager:
    def __init__(self, on_packet: PacketCb) -> None:
        self.on_packet = on_packet
        self.sources: list[Any] = []
        self.subscribers: set[asyncio.Queue] = set()
        # Attached later by main.py so on_packet can call write_live/write_playback
        self.writer: Any = None

    async def start_tcp(self, host: str, port: int) -> None:
        src = TcpSource(host, port, self.on_packet)
        self.sources.append(src)
        # Run in background so start_tcp returns immediately
        asyncio.create_task(self._run(src, f"TCP {host}:{port}"))

    async def start_udp(
        self,
        host: str,
        port: int,
        *,
        multicast: bool = False,
        interface: str | None = None,
    ) -> None:
        src = UdpSource(host, port, self.on_packet,
                        multicast=multicast, interface=interface)
        self.sources.append(src)
        asyncio.create_task(self._run(src, f"UDP {host}:{port}"))

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
        for s in self.sources:
            try:
                await s.stop()
            except Exception:
                log.exception("Error stopping source")

    # ---- pub/sub for WS clients --------------------------------------- #
    def subscribe(self) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue(maxsize=500)
        self.subscribers.add(q)
        log.info("WS subscriber added (total=%d)", len(self.subscribers))
        return q

    def unsubscribe(self, q: asyncio.Queue) -> None:
        self.subscribers.discard(q)
        log.info("WS subscriber removed (total=%d)", len(self.subscribers))

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