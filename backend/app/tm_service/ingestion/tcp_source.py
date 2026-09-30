import asyncio
import logging
import time

from .base import AbstractTmSource, PacketSink
from .depacketizer import StreamDepacketizer

log = logging.getLogger(__name__)


class TcpSource(AbstractTmSource):
    def __init__(self, host: str, port: int, sink: PacketSink):
        super().__init__(sink)
        self.host = host
        self.port = port
        self._server: asyncio.AbstractServer | None = None

    async def start(self) -> None:
        self._running = True
        self._server = await asyncio.start_server(self._handle, self.host, self.port)
        log.info("TCP source listening on %s:%d", self.host, self.port)
        await self._server.serve_forever()

    async def stop(self) -> None:
        self._running = False
        if self._server:
            self._server.close()
            await self._server.wait_closed()

    async def _handle(self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter):
        peer = writer.get_extra_info("peername")
        log.info("TCP client connected: %s", peer)
        depkt = StreamDepacketizer()
        try:
            while self._running:
                chunk = await reader.read(4096)
                if not chunk:
                    break

                for frame in depkt.feed(chunk):
                    try:
                        await self._emit(frame, time.time())
                    except Exception:
                        # One bad packet should never kill the stream
                        log.exception("sink failed; dropping frame (%d bytes)", len(frame))
        except asyncio.CancelledError:
            raise
        except Exception:
            log.exception("TCP handler crashed for peer %s", peer)
        finally:
            try:
                writer.close()
                await writer.wait_closed()
            except Exception:
                pass
            log.info("TCP client disconnected: %s", peer)