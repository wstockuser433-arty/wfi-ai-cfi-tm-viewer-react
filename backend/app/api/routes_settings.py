"""REST endpoints for reading and updating serial config."""

from fastapi import APIRouter, Body, HTTPException
import asyncio
import logging

from ..tm_service.ingestion.serial_config import (
    SerialConfig, get_serial_config, set_serial_config,
)

router = APIRouter(prefix="/api/settings", tags=["settings"])
log = logging.getLogger(__name__)


@router.get("/serial")
async def get_serial():
    return get_serial_config().__dict__


@router.put("/serial")
async def put_serial(payload: dict = Body(...)):
    current = get_serial_config()
    fields = {**current.__dict__, **payload}

    try:
        new_cfg = SerialConfig(**fields)
    except TypeError as e:
        raise HTTPException(status_code=400, detail=f"bad config: {e}")

    errs = new_cfg.validate()
    if errs:
        raise HTTPException(status_code=400, detail="; ".join(errs))

    # Persist immediately — this is what GET returns on reload.
    set_serial_config(new_cfg)

    # Fire-and-forget transport switch in a background task. Errors from
    # opening the port will show up in the log and in the next GET's
    # status field (if you add one), but they won't fail this response.
    from ..main import manager
    loop = asyncio.get_running_loop()
    loop.create_task(_apply_transport_safe(manager, new_cfg.transport))

    return new_cfg.__dict__


async def _apply_transport_safe(manager, transport: str) -> None:
    """Apply the transport switch; log but never raise."""
    try:
        await manager.apply_transport(transport)
    except Exception:
        log.exception("Transport switch to %s failed", transport)