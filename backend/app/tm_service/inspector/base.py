from abc import ABC, abstractmethod
from typing import Any


class PacketDecoder(ABC):
    """
    Uniform interface for every decoder implementation.

    Receives raw bytes + receive timestamp, returns a unified DecodedPacket dict.
    The caller (on_packet in main.py) doesn't care about the wire format.
    """

    @abstractmethod
    def decode(self, raw: bytes, timestamp: float) -> dict[str, Any]:
        """
        Args:
            raw:       Full CCSDS/PUS packet bytes (primary header + secondary
                       header + user data + CRC)
            timestamp: Receive time as Unix seconds (float)

        Returns:
            Dict matching the frontend DecodedPacket shape
            (frontend/src/types/packet.ts)
        """