import json
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from redis.asyncio import Redis

from ...schemas.packet import DecodedPacket
from ...db.models.packet import PacketRow
from ...db.models.parameter import ParameterRow

class StorageWriter:
    def __init__(self, redis: Redis, live_stream: str = "tm.live"):
        self.redis = redis
        self.live_stream = live_stream

    async def write_live(self, packet: DecodedPacket) -> None:
        await self.redis.xadd(
            self.live_stream,
            {"data": packet.model_dump_json()},
            maxlen=10_000,
            approximate=True,
        )

    async def write_playback(self, db: AsyncSession, packet: DecodedPacket) -> None:
        row = PacketRow(
            ts=datetime.fromtimestamp(packet.timestamp, tz=timezone.utc),
            apid=packet.apid,
            subsystem=packet.subsystem,
            card=packet.card,
            seq=packet.seq,
            crc_ok=packet.crc_ok,
            raw_hex=packet.raw_hex,
            payload_hex=packet.payload_hex,
        )
        db.add(row)
        await db.flush()  # get row.id

        for name, f in packet.fields.items():
            db.add(ParameterRow(
                packet_id=row.id,
                name=name,
                subsystem=packet.subsystem,
                card=packet.card,
                value_num=float(f.value) if isinstance(f.value, (int, float)) else None,
                unit=f.unit,
                status=f.status,
                raw_json=json.dumps(f.value) if not isinstance(f.value, (int,float)) else None,
            ))