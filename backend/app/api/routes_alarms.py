from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from ..db.postgres import get_db
from ..db.models.alarm import AlarmRow

router = APIRouter(prefix="/api", tags=["alarms"])

@router.get("/alarms")
async def list_alarms(
    limit: int = Query(500, le=1000),
    db: AsyncSession = Depends(get_db)
):
    """Fetch alarm history from Postgres."""
    stmt = select(AlarmRow).order_by(AlarmRow.ts.desc()).limit(limit)
    rows = (await db.execute(stmt)).scalars().all()
    
    return {
        "alarms": [
            {
                "id": str(r.id),  # convert int to string for frontend compatibility
                "ts": r.ts.isoformat(),
                "severity": r.severity,
                "subsystem": r.subsystem,
                "card": r.card,
                "param_name": r.param_name,
                "message": r.message,
                "packet_id": r.packet_id
            }
            for r in rows
        ]
    }

@router.post("/alarms/{alarm_id}/ack")
async def ack(
    alarm_id: str,
    db: AsyncSession = Depends(get_db)
):
    """Delete (acknowledge) an alarm from the DB."""
    try:
        id_int = int(alarm_id)
    except ValueError:
        return {"ok": False, "error": "invalid id"}
        
    await db.execute(delete(AlarmRow).where(AlarmRow.id == id_int))
    await db.commit()
    
    return {"ok": True}