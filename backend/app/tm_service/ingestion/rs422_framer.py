"""
RS-422 Outer Frame Extractor (EBOX protocol)
============================================

Per ICD section 3, every packet exchanged between CTPU and EBOX is wrapped in
a fixed 4-byte header and 4-byte trailer:

    ┌──────────────────────┐
    │ 0x23 0x23 0x2A 0x2A  │  ← outer header (4 bytes)
    ├──────────────────────┤
    │   CCSDS-style packet │  ← up to 249 bytes
    ├──────────────────────┤
    │ 0x2A 0x2A 0x23 0x23  │  ← outer trailer (4 bytes)
    └──────────────────────┘

This module slices one or more such frames out of a byte stream. It is a
sibling to StreamDepacketizer — the ingestion sources chain them:

    UDP datagram → Rs422Framer.feed() → list[inner_ccsds_packet] → decoder.decode()

The framer is intentionally strict: it does NOT attempt to resync on
malformed frames. If the header/trailer markers are missing, it drops the
stream up to the next 0x23 0x23 0x2A 0x2A sequence (best-effort) to avoid
getting stuck on a corrupted packet.
"""

from __future__ import annotations

import logging

log = logging.getLogger(__name__)

# ─── Outer frame markers ────────────────────────────────────────────────
OUTER_HEADER = bytes([0x23, 0x23, 0x2A, 0x2A])
OUTER_TRAILER = bytes([0x2A, 0x2A, 0x23, 0x23])

# ─── Size limits from ICD section 4.1 ───────────────────────────────────
MAX_INNER_PACKET_LEN = 249       # CCSDS-style packet, main header to checksum
MIN_INNER_PACKET_LEN = 6 + 1 + 1 # 6-byte hdr + 1-byte sub-hdr + 1-byte checksum

# ─── Buffer safety ──────────────────────────────────────────────────────
DEFAULT_MAX_BUFFER = 1 << 16     # 64 KiB — plenty for several frames

# TBD: What happens if the payload contains bytes matching the trailer?
# The ICD does not mention byte-stuffing or escaping. If the EBOX
# implementation stuffs bytes, this framer will need an un-stuffing step.
# For now we assume payload bytes are transmitted raw.


class Rs422Framer:
    """
    Slices outer RS-422 frames out of a byte stream.

    Usage:
        framer = Rs422Framer()
        for chunk in incoming_chunks():
            for inner_packet in framer.feed(chunk):
                decode(inner_packet)

    Each emitted item is the raw CCSDS-style packet WITHOUT the outer
    header/trailer. The decoder sees exactly what the ICD defines as the
    packet structure.
    """

    def __init__(self, *, max_buffer: int = DEFAULT_MAX_BUFFER) -> None:
        self.buf = bytearray()
        self.max_buffer = max_buffer
        self.frames_emitted = 0
        self.frames_dropped = 0
        self.bytes_dropped = 0

    def feed(self, chunk: bytes) -> list[bytes]:
        """
        Accumulate bytes and yield complete inner packets.

        Returns a list of complete CCSDS-style packets (outer frame stripped).
        """
        if not chunk:
            return []

        self.buf.extend(chunk)

        # Safety valve — if we never find a valid frame, don't grow forever
        if len(self.buf) > self.max_buffer:
            overflow = len(self.buf) - self.max_buffer
            del self.buf[:overflow]
            self.bytes_dropped += overflow

        packets: list[bytes] = []

        while True:
            # Find the next outer header
            start = self.buf.find(OUTER_HEADER)
            if start == -1:
                # No header in buffer. Keep the last 3 bytes — a partial
                # header could be split across chunks.
                if len(self.buf) > 3:
                    discard = len(self.buf) - 3
                    del self.buf[:discard]
                    self.bytes_dropped += discard
                break

            # Discard bytes before the header (junk, corrupted previous frame)
            if start > 0:
                del self.buf[:start]
                self.bytes_dropped += start

            # We now have OUTER_HEADER at buf[0]. Look for the trailer.
            search_from = len(OUTER_HEADER)
            end = self.buf.find(OUTER_TRAILER, search_from)

            if end == -1:
                # Incomplete frame — wait for more bytes
                if len(self.buf) > MAX_INNER_PACKET_LEN + 8 + 4:
                    # We've buffered way more than a max frame should need.
                    # The trailer is missing — treat this as a corrupt frame.
                    # Drop the header and try again from the next byte.
                    del self.buf[:len(OUTER_HEADER)]
                    self.frames_dropped += 1
                    continue
                break

            # Extract the inner packet between header and trailer
            inner = bytes(self.buf[len(OUTER_HEADER):end])
            trailer_end = end + len(OUTER_TRAILER)

            # Sanity checks on inner packet size
            if len(inner) < MIN_INNER_PACKET_LEN:
                log.debug(
                    "RS-422 frame too small (%d bytes < %d min) — dropping",
                    len(inner), MIN_INNER_PACKET_LEN,
                )
                del self.buf[:trailer_end]
                self.frames_dropped += 1
                continue

            if len(inner) > MAX_INNER_PACKET_LEN:
                log.debug(
                    "RS-422 frame too large (%d bytes > %d max) — dropping",
                    len(inner), MAX_INNER_PACKET_LEN,
                )
                del self.buf[:trailer_end]
                self.frames_dropped += 1
                continue

            packets.append(inner)
            del self.buf[:trailer_end]
            self.frames_emitted += 1

        return packets

    def reset(self) -> None:
        self.buf.clear()

    def stats(self) -> dict:
        return {
            "frames_emitted": self.frames_emitted,
            "frames_dropped": self.frames_dropped,
            "bytes_dropped": self.bytes_dropped,
            "buffered": len(self.buf),
        }