import asyncio
import logging
import time

from .base import AbstractTmSource, PacketSink
from .depacketizer import StreamDepacketizer
from .format_map import header_len_for
from .rs422_framer import Rs422Framer
from ...config import settings

log = logging.getLogger(__name__)


class TcpSource(AbstractTmSource):
    def __init__(self, host: str, port: int, sink: PacketSink):
        super().__init__(sink)
        self.host = host
        self.port = port
        self._is_ebox = settings.tm_decoder.lower() == "ebox"
        self._header_len = header_len_for(settings.tm_decoder)
        self._server: asyncio.AbstractServer | None = None

    async def start(self) -> None:
        self._running = True
        self._server = await asyncio.start_server(self._handle, self.host, self.port)
        log.info(
            "TCP source listening on %s:%d (decoder=%s)",
            self.host, self.port, settings.tm_decoder,
        )
        await self._server.serve_forever()

    async def stop(self) -> None:
        self._running = False
        if self._server:
            self._server.close()
            await self._server.wait_closed()

    async def _handle(
        self,
        reader: asyncio.StreamReader,
        writer: asyncio.StreamWriter,
    ) -> None:
        peer = writer.get_extra_info("peername")
        log.info("TCP client connected: %s", peer)

        # Two framer strategies depending on decoder mode:
        #   EBOX  → Rs422Framer strips the outer 23 23 2A 2A … 2A 2A 23 23 frame
        #   other → StreamDepacketizer slices CCSDS/custom frames
        if self._is_ebox:
            framer = Rs422Framer()
            depkt = None
        else:
            framer = None
            depkt = StreamDepacketizer(header_len=self._header_len)

        try:
            while self._running:
                chunk = await reader.read(4096)
                if not chunk:
                    break

                if self._is_ebox:
                    packets = framer.feed(chunk)
                else:
                    packets = depkt.feed(chunk)

                for pkt in packets:
                    try:
                        await self._emit(pkt, time.time())
                    except Exception:
                        log.exception(
                            "sink failed; dropping frame (%d bytes)", len(pkt)
                        )

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