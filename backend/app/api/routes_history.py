from datetime import datetime
from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from ..db.postgres import get_db
from ..db.models.packet import PacketRow

router = APIRouter(prefix="/api", tags=["history"])


@router.get("/history")
async def history(
    start: datetime = Query(...),
    end: datetime = Query(...),
    subsystem: str | None = None,
    apid: int | None = None,
    limit: int = Query(5000, le=50000),
    db: AsyncSession = Depends(get_db),
):
    conds = [PacketRow.ts >= start, PacketRow.ts <= end]
    if subsystem:
        conds.append(PacketRow.subsystem == subsystem)
    if apid is not None:
        conds.append(PacketRow.apid == apid)

    stmt = (
        select(PacketRow)
        .where(and_(*conds))
        .order_by(PacketRow.ts)
        .limit(limit)
    )
    rows = (await db.execute(stmt)).scalars().all()

    # Return every field the frontend expects — crc_ok included
    return {
        "count": len(rows),
        "packets": [
            {
                "id": r.id,
                "ts": r.ts.isoformat(),
                "apid": r.apid,
                "subsystem": r.subsystem,
                "card": r.card,
                "crc_ok": r.crc_ok,
                "seq": r.seq,
                "raw_hex": r.raw_hex,
            }
            for r in rows
        ],
    }