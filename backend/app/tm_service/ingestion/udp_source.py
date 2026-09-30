"""
UDP Telemetry Source
====================
Listens on a UDP socket and forwards complete CCSDS frames to the sink.

Why UDP matters for TM:
- Some ground stations / MCS bridges push TM over UDP multicast.
- UDP gives you "fire and forget" semantics — perfect for high-rate TM where
  retransmission is pointless (you'd rather drop a frame than stall).
- Multicast support lets multiple consumers (this TM viewer + a logger +
  a monitoring tool) tap the same stream without a broker.

Frame boundary detection:
- UDP preserves message boundaries, so *one datagram = one or more frames*.
- We still run the StreamDepacketizer because some senders coalesce
  multiple CCSDS frames into a single datagram (common for high-rate TM).
"""

from __future__ import annotations

import asyncio
import logging
import socket
import struct
import time
from typing import Optional

from .base import AbstractTmSource, PacketSink
from .depacketizer import StreamDepacketizer

log = logging.getLogger(__name__)

# Defaults are tuned for TM use-cases: 64 KiB is the practical UDP max
# (IPv4 cap is 65507 after headers). Anything bigger gets fragmented at IP
# layer — which is fine but suboptimal.
DEFAULT_RCVBUF = 8 * 1024 * 1024      # 8 MB kernel buffer — avoids drops
MAX_DATAGRAM = 65535


class UdpSource(AbstractTmSource):
    """
    Async UDP listener that yields CCSDS frames to `sink`.

    Supports unicast (bind to a specific IP) and multicast (join a group).

    Parameters
    ----------
    host : str
        Interface to bind. Use "0.0.0.0" for all interfaces (unicast),
        or a multicast group like "239.1.1.1" for multicast.
    port : int
        UDP port to bind.
    sink : PacketSink
        Async callback `await sink(raw_bytes, timestamp)`.
    multicast : bool
        If True, join `host:port` as a multicast group.
    interface : str | None
        For multicast, which local interface to join on (e.g. "eth0" or
        "192.168.1.10"). None = default interface.
    recv_buffer : int
        Kernel receive buffer size in bytes. Larger = fewer drops.
    """

    def __init__(
        self,
        host: str,
        port: int,
        sink: PacketSink,
        *,
        multicast: bool = False,
        interface: Optional[str] = None,
        recv_buffer: int = DEFAULT_RCVBUF,
    ) -> None:
        super().__init__(sink)
        self.host = host
        self.port = port
        self.multicast = multicast
        self.interface = interface
        self.recv_buffer = recv_buffer

        self._transport: Optional[asyncio.DatagramTransport] = None
        self._protocol: Optional[_UdpProtocol] = None
        self._task: Optional[asyncio.Task] = None

    # ------------------------------------------------------------------ #
    # Lifecycle
    # ------------------------------------------------------------------ #
    async def start(self) -> None:
        self._running = True
        loop = asyncio.get_running_loop()

        # Create the socket ourselves so we can set SO_REUSEADDR and
        # (for multicast) SO_REUSEPORT before binding.
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)

        # Allow multiple TM viewers to bind the same multicast group
        if hasattr(socket, "SO_REUSEPORT"):
            try:
                sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEPORT, 1)
            except OSError:
                # Not available on all platforms (Windows) — safe to ignore
                pass

        # Expand kernel buffer so bursts don't overflow
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_RCVBUF, self.recv_buffer)

        # On Linux, SO_RCVBUFFORCE bypasses rmem_max — try, but don't fail
        if hasattr(socket, "SO_RCVBUFFORCE"):
            try:
                sock.setsockopt(socket.SOL_SOCKET, socket.SO_RCVBUFFORCE, self.recv_buffer)
            except (OSError, PermissionError):
                pass

        if self.multicast:
            await self._setup_multicast(sock)

        try:
            sock.bind((self.host if not self.multicast else "", self.port))
        except OSError as e:
            sock.close()
            raise RuntimeError(f"UDP bind failed on {self.host}:{self.port} — {e}") from e

        sock.setblocking(False)

        # Hand the socket to asyncio
        self._protocol = _UdpProtocol(self)
        self._transport, _ = await loop.create_datagram_endpoint(
            lambda: self._protocol,
            sock=sock,
        )

        log.info(
            "UDP source listening on %s:%d (multicast=%s, rcvbuf=%d)",
            self.host, self.port, self.multicast, self.recv_buffer,
        )

    async def stop(self) -> None:
        self._running = False
        if self._transport is not None:
            self._transport.close()
            self._transport = None
        if self._task is not None:
            self._task.cancel()
            try:
                await self._task
            except (asyncio.CancelledError, Exception):
                pass
            self._task = None
        log.info("UDP source stopped (%s:%d)", self.host, self.port)

    # ------------------------------------------------------------------ #
    # Multicast setup
    # ------------------------------------------------------------------ #
    async def _setup_multicast(self, sock: socket.socket) -> None:
        try:
            group = socket.inet_aton(self.host)
            if self.interface:
                iface = socket.inet_aton(self.interface)
            else:
                iface = socket.inet_aton("0.0.0.0")
            mreq = group + iface
            sock.setsockopt(socket.IPPROTO_IP, socket.IP_ADD_MEMBERSHIP, mreq)
            log.info("Joined multicast group %s on interface %s",
                     self.host, self.interface or "default")
        except OSError as e:
            raise RuntimeError(
                f"Failed to join multicast {self.host} on {self.interface}: {e}"
            ) from e

    # ------------------------------------------------------------------ #
    # Called by _UdpProtocol for each datagram
    # ------------------------------------------------------------------ #
    async def _on_datagram(self, data: bytes, addr: tuple[str, int]) -> None:
        """
        One datagram → possibly multiple CCSDS frames.

        We use a fresh StreamDepacketizer per datagram for strict
        message-boundary alignment. This avoids desync if a sender
        ever truncates a frame mid-stream.
        """
        # Too small to contain our 7-byte header + 2-byte CRC
        if len(data) < 9:
            log.debug("dropping short datagram (%d bytes) from %s", len(data), addr)
            return

        dp = StreamDepacketizer()
        frames = dp.feed(data)

        if not frames:
            # Data arrived but incomplete — held in dp.buf. For UDP we
            # intentionally drop it: a partial datagram is a lost packet.
            log.debug("incomplete frame in datagram from %s (%d bytes)", addr, len(data))
            return

        ts = time.time()
        for raw in frames:
            try:
                await self._emit(raw, ts)
            except Exception:
                log.exception("sink failed for UDP frame from %s", addr)

    def stats(self) -> dict:
        if self._protocol is None:
            return {"running": False}
        return {
            "running": self._running,
            "host": self.host,
            "port": self.port,
            "multicast": self.multicast,
            "datagrams": self._protocol.datagrams,
            "bytes_in": self._protocol.bytes_in,
            "last_from": self._protocol.last_from,
            "errors": self._protocol.errors,
        }


# ---------------------------------------------------------------------- #
# asyncio DatagramProtocol bridge
# ---------------------------------------------------------------------- #
class _UdpProtocol(asyncio.DatagramProtocol):
    """
    Thin adapter: asyncio gives us `datagram_received` on the event loop,
    we forward it to the owning UdpSource via `run_coroutine_threadsafe`-
    style scheduling.
    """

    def __init__(self, owner: UdpSource) -> None:
        self.owner = owner
        self.datagrams = 0
        self.bytes_in = 0
        self.errors = 0
        self.last_from: Optional[str] = None
        self._tasks: set[asyncio.Task] = set()

    def datagram_received(self, data: bytes, addr: tuple[str, int]) -> None:
        self.datagrams += 1
        self.bytes_in += len(data)
        self.last_from = f"{addr[0]}:{addr[1]}"

        # Schedule the async processing without blocking the protocol
        task = asyncio.create_task(self.owner._on_datagram(data, addr))
        self._tasks.add(task)
        task.add_done_callback(self._tasks.discard)

    def error_received(self, exc: Exception) -> None:
        self.errors += 1
        log.warning("UDP error: %s", exc)

    def connection_lost(self, exc: Optional[Exception]) -> None:
        if exc is not None:
            log.warning("UDP connection lost: %s", exc)
        else:
            log.info("UDP connection closed")