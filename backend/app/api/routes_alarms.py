from fastapi import APIRouter

router = APIRouter(prefix="/api", tags=["alarms"])

# In-memory for now; persist in a later iteration
_ACTIVE: dict[str, dict] = {}


@router.get("/alarms")
def list_alarms():
    return {"alarms": list(_ACTIVE.values())}


@router.post("/alarms/{alarm_id}/ack")
def ack(alarm_id: str):
    _ACTIVE.pop(alarm_id, None)
    return {"ok": True}