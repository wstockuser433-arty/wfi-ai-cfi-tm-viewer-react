"""
Stream → Frame Depacketizer
===========================
Given a raw byte stream (from TCP, UDP datagram, or file), slice out
complete CCSDS frames using our simplified header:

    bytes 0    : CC (version + type)
    bytes 1-2  : APID (11 bits) + flags
    bytes 3-4  : Sequence count (14 bits) + flags
    bytes 5-6  : Length - 1  (payload length minus 1)
    bytes 7..N : Payload
    bytes N+1..N+2 : CRC16 (2 bytes)

Total frame size = 7 (header) + (length + 1) (payload) + 2 (CRC)
"""

from __future__ import annotations

import struct

# Must live here (not imported from inspector) to avoid a circular import.
CCSDS_HEADER_LEN = 7
CRC_LEN = 2
MIN_FRAME_LEN = CCSDS_HEADER_LEN + CRC_LEN   # 9 bytes minimum

# Hard cap to protect against a corrupted length field eating all memory.
# 64 KiB payload is generous for TM; raise if your ICD says otherwise.
MAX_PAYLOAD_LEN = 65535


class StreamDepacketizer:
    """
    Accumulates bytes, yields complete frames as they arrive.

    Usage:
        dp = StreamDepacketizer()
        for chunk in incoming_chunks():
            for frame in dp.feed(chunk):
                process(frame)
    """

    def __init__(self, *, max_buffer: int = 1 << 20) -> None:
        self.buf = bytearray()
        self.max_buffer = max_buffer
        self.dropped = 0
        self.frames_emitted = 0

    def feed(self, chunk: bytes) -> list[bytes]:
        if not chunk:
            return []

        self.buf.extend(chunk)

        # Defensive: if something upstream is misbehaving and we never find
        # a valid frame, don't grow forever.
        if len(self.buf) > self.max_buffer:
            # Keep the tail — a real frame is likely at the end
            overflow = len(self.buf) - self.max_buffer
            del self.buf[:overflow]
            self.dropped += overflow

        frames: list[bytes] = []

        while True:
            if len(self.buf) < MIN_FRAME_LEN:
                break

            # Length field is "payload length - 1" per CCSDS convention
            length = struct.unpack_from(">H", self.buf, 5)[0]
            payload_len = length + 1

            if payload_len > MAX_PAYLOAD_LEN:
                # Bogus length — resync by shifting one byte and retrying
                del self.buf[:1]
                self.dropped += 1
                continue

            total = CCSDS_HEADER_LEN + payload_len + CRC_LEN
            if len(self.buf) < total:
                break

            frames.append(bytes(self.buf[:total]))
            del self.buf[:total]
            self.frames_emitted += 1

        return frames

    def reset(self) -> None:
        self.buf.clear()