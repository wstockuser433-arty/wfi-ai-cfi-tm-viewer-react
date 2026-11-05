from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime

from ..db.postgres import get_db
from ..db.models.packet import PacketRow
from ..tm_service.inspector.factory import get_decoder
from ..config import settings

router = APIRouter(prefix="/api", tags=["packets"])


@router.get("/packets")
async def list_packets(
    apid: int | None = None,
    subsystem: str | None = None,
    limit: int = 100,
    db: AsyncSession = Depends(get_db),
):
    # ... existing code for listing packets ...
    stmt = select(PacketRow).order_by(desc(PacketRow.ts)).limit(limit)
    if apid is not None:
        stmt = stmt.where(PacketRow.apid == apid)
    if subsystem:
        stmt = stmt.where(PacketRow.subsystem == subsystem)
    rows = (await db.execute(stmt)).scalars().all()
    return {"packets": rows}


# ⭐ NEW: Fetch a single packet by ID and decode it
@router.get("/packets/{packet_id}")
async def get_packet_by_id(packet_id: int, db: AsyncSession = Depends(get_db)):
    stmt = select(PacketRow).where(PacketRow.id == packet_id)
    row = (await db.execute(stmt)).scalars().first()
    
    if not row:
        raise HTTPException(status_code=404, detail="Packet not found")
    
    decoder = get_decoder(settings.tm_decoder)
    raw_bytes = bytes.fromhex(row.raw_hex)
    
    try:
        pkt_dict = decoder.decode(raw_bytes, row.ts.timestamp())
        return pkt_dict
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Decode failed: {e}")