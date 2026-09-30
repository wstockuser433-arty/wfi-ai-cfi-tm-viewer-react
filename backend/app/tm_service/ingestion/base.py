from abc import ABC, abstractmethod
from typing import AsyncIterator, Callable, Awaitable

PacketSink = Callable[[bytes, float], Awaitable[None]]

class AbstractTmSource(ABC):
    """Common interface for TCP, UDP, File, DB sources."""

    def __init__(self, sink: PacketSink):
        self.sink = sink
        self._running = False

    @abstractmethod
    async def start(self) -> None: ...

    @abstractmethod
    async def stop(self) -> None: ...

    async def _emit(self, raw: bytes, ts: float) -> None:
        await self.sink(raw, ts)