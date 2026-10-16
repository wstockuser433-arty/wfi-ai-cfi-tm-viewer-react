"""
EBOX RS-422 Additive Checksum
=============================

Per ICD section 4.1: "The calculation method is the lower byte of the sum of
single-byte values in the checksum area."

Checksum area = main header + sub-header + effective data field.
The checksum byte itself is NOT included in the sum.

    checksum = sum(all bytes) & 0xFF

This is a plain modulo-256 sum, not a CRC and not a one's-complement sum.
"""

from __future__ import annotations


def compute_ebox_checksum(data: bytes | bytearray) -> int:
    """
    Compute the EBOX additive checksum over a byte sequence.

    Args:
        data: The bytes comprising main header + sub-header + effective data.
              The checksum byte itself must NOT be included.

    Returns:
        Integer 0..255 — the lower byte of the sum.
    """
    return sum(data) & 0xFF


def verify_ebox_checksum(
    data: bytes | bytearray,
    expected: int,
) -> bool:
    """
    Verify a received checksum against a computed one.

    Args:
        data:     Main header + sub-header + effective data (excludes the checksum byte)
        expected: The received checksum byte (0..255)

    Returns:
        True if the computed checksum equals the received value.
    """
    return compute_ebox_checksum(data) == (expected & 0xFF)