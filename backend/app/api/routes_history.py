from datetime import datetime
from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, and_, func
from sqlalchemy.ext.asyncio import AsyncSession

from ..db.postgres import get_db
from ..db.models.packet import PacketRow

router = APIRouter(prefix="/api", tags=["history"])


@router.get("/history")
async def history(
    start: datetime | None = None,
    end: datetime | None = None,
    subsystem: str | None = None,
    subsystems: str | None = None,
    apid: int | None = None,
    limit: int = Query(500, le=50000),
    offset: int = Query(0, ge=0),
    order: str = Query("asc", pattern="^(asc|desc)$"),
    db: AsyncSession = Depends(get_db),
):
    conds = []
    if start:
        conds.append(PacketRow.ts >= start)
    if end:
        conds.append(PacketRow.ts <= end)
    if subsystem:
        conds.append(PacketRow.subsystem == subsystem)
    if subsystems:
        names = [s for s in (x.strip() for x in subsystems.split(",")) if s]
        if names:
            conds.append(PacketRow.subsystem.in_(names))
    if apid is not None:
        conds.append(PacketRow.apid == apid)

    count_stmt = select(func.count((PacketRow.id)))
    if conds:
        count_stmt = count_stmt.where(and_(*conds))
    result = await db.execute(count_stmt)
    total_count = result.scalar() or 0

    order_col = PacketRow.ts.desc() if order == "desc" else PacketRow.ts.asc()

    stmt = select(PacketRow)
    if conds:
        stmt = stmt.where(and_(*conds))
    stmt = stmt.order_by(order_col).limit(limit).offset(offset)
    rows = (await db.execute(stmt)).scalars().all()

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
                "payload_hex": r.payload_hex,
                # ⭐ Map the ParameterRows to DecodedField objects
                "fields": {
                    p.name: {
                        "value": p.value_num if p.value_num is not None else p.raw_json,
                        "unit": p.unit or "",
                        "status": p.status or "OK",
                        "limits": [None, None],  # DB doesn't store limits
                        "enum": None,            # DB doesn't store enum labels
                    }
                    for p in r.parameters
                }
            }
            for r in rows
        ],
    }