"""
Stream → Frame Depacketizer
===========================
Given a raw byte stream (from TCP, UDP datagram, or file), slice out
complete frames.

Two header layouts are supported:

Standard CCSDS Primary Header (6 bytes) — used by PUS packets
    bytes 0-1  : Version(3) | Type(1) | SecHdrFlag(1) | APID(11)
    bytes 2-3  : SeqFlags(2) | SeqCount(14)
    bytes 4-5  : Packet Data Length - 1  (16-bit big-endian)
    bytes 6..N : Payload
    bytes N+1..N+2 : CRC-16 (2 bytes)   (trailing; not part of CCSDS standard)

Legacy custom header (7 bytes) — used by our previous custom format
    byte  0    : CC
    bytes 1-2  : APID + flags
    bytes 3-4  : SEQ + flags
    bytes 5-6  : Length - 1
    bytes 7..N : Payload
    bytes N+1..N+2 : CRC-16 (2 bytes)

Total frame size = header_len + (length + 1) + CRC_LEN
"""

from __future__ import annotations

import struct

# Default header length. Overridden per-source based on the decoder mode.
DEFAULT_HEADER_LEN = 6      # standard CCSDS primary header

# Kept for backward compatibility — some modules import this constant.
# Note: this now reflects the CCSDS standard primary header size.
CCSDS_HEADER_LEN = 6
CRC_LEN = 2

# Hard cap to protect against a corrupted length field eating all memory.
MAX_PAYLOAD_LEN = 65535


class StreamDepacketizer:
    """
    Accumulates bytes, yields complete frames as they arrive.

    Args:
        header_len: primary-header size in bytes.
                    6 for standard CCSDS/PUS, 7 for the legacy custom format.
        max_buffer: upper bound on internal buffer (safety valve)

    Usage:
        dp = StreamDepacketizer(header_len=6)
        for chunk in incoming_chunks():
            for frame in dp.feed(chunk):
                process(frame)
    """

    def __init__(
        self,
        *,
        header_len: int = DEFAULT_HEADER_LEN,
        max_buffer: int = 1 << 20,
    ) -> None:
        if header_len not in (6, 7):
            raise ValueError(f"header_len must be 6 or 7, got {header_len}")
        self.buf = bytearray()
        self.header_len = header_len
        self.max_buffer = max_buffer
        self.dropped = 0
        self.frames_emitted = 0

    @property
    def min_frame_len(self) -> int:
        # header + at least 1 byte payload + CRC
        if self.header_len == 6:
            return 8 + CRC_LEN      # 6 header + 1 payload + 2 CRC = 9
        return 7 + 1 + CRC_LEN      # legacy: 7 + 1 + 2 = 10

    def feed(self, chunk: bytes) -> list[bytes]:
        if not chunk:
            return []

        self.buf.extend(chunk)

        if len(self.buf) > self.max_buffer:
            overflow = len(self.buf) - self.max_buffer
            del self.buf[:overflow]
            self.dropped += overflow

        frames: list[bytes] = []

        while True:
            if len(self.buf) < self.min_frame_len:
                break

            # Read the 16-bit length field that sits at the end of the primary header.
            length_offset = self.header_len - 2
            length = struct.unpack_from(">H", self.buf, length_offset)[0]

            # Total packet size depends on the format:
            #   - CCSDS (6-byte header):  total = length_field + 7
            #   - Legacy custom (7-byte): total = length_field + 10
            if self.header_len == 6:
                total = length + 7
            else:  # header_len == 7
                total = length + 10

            if total < self.min_frame_len or total > 65535:
                # Bogus length — resync by shifting one byte and retrying
                del self.buf[:1]
                self.dropped += 1
                continue

            if len(self.buf) < total:
                break

            frames.append(bytes(self.buf[:total]))
            del self.buf[:total]
            self.frames_emitted += 1

        return frames

    def reset(self) -> None:
        self.buf.clear()