from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from ..db.postgres import get_db
from ..db.models.packet import PacketRow

router = APIRouter(prefix="/api", tags=["packets"])


@router.get("/packets")
async def list_packets(
    apid: int | None = None,
    subsystem: str | None = None,
    limit: int = Query(100, le=1000),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(PacketRow).order_by(desc(PacketRow.ts)).limit(limit)
    if apid is not None:
        stmt = stmt.where(PacketRow.apid == apid)
    if subsystem:
        stmt = stmt.where(PacketRow.subsystem == subsystem)

    rows = (await db.execute(stmt)).scalars().all()
    return {
        "packets": [
            {
                "id": r.id,
                "ts": r.ts.isoformat(),
                "apid": r.apid,
                "subsystem": r.subsystem,
                "card": r.card,
                "seq": r.seq,
                "crc_ok": r.crc_ok,
                "raw_hex": r.raw_hex,
            }
            for r in rows
        ]
    }