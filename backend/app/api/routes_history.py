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
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    conds = [PacketRow.ts >= start, PacketRow.ts <= end]
    if subsystem:
        conds.append(PacketRow.subsystem == subsystem)
    if apid is not None:
        conds.append(PacketRow.apid == apid)

    # Get total count for this window
    count_stmt = select(PacketRow.id).where(
        PacketRow.ts >= start, 
        PacketRow.ts <= end
    )    
    result = await db.execute(count_stmt)
    total_count = len(result.all())

    stmt = (
        select(PacketRow)
        .where(and_(*conds))
        .order_by(PacketRow.ts)
        .limit(limit)
        .offset(offset)
    )
    rows = (await db.execute(stmt)).scalars().all()

    # Return every field the frontend expects — crc_ok included
    return {
        "count": total_count,
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