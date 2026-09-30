import asyncio
from datetime import datetime
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from typing import AsyncIterator
from ...db.models.packet import PacketRow
from ..schemas.packet import DecodedPacket

class PlaybackSession:
    def __init__(self, db: AsyncSession, start: datetime, end: datetime, speed: float = 1.0):
        self.db = db
        self.start, self.end = start, end
        self.speed = speed
        self._stop = False

    def stop(self) -> None:
        self._stop = True

    async def stream(self) -> AsyncIterator[DecodedPacket]:
        stmt = select(PacketRow).where(
            PacketRow.ts >= self.start, PacketRow.ts <= self.end
        ).order_by(PacketRow.ts)
        result = await self.db.stream(stmt)

        prev_ts: datetime | None = None
        async for row in result:
            if self._stop:
                break
            if prev_ts is not None:
                gap = (row.ts - prev_ts).total_seconds() / max(self.speed, 0.001)
                if gap > 0:
                    await asyncio.sleep(gap)
            prev_ts = row.ts
            # Rebuild the DecodedPacket from DB rows + parameters
            yield await self._hydrate(row)

    async def _hydrate(self, row: PacketRow) -> DecodedPacket:
        # Load parameters and reconstruct the "fields" dict
        ...