"""REST endpoints for reading and updating serial config."""

from fastapi import APIRouter, Body, HTTPException
import logging
import asyncio

from ..tm_service.ingestion.serial_config import (
    SerialConfig, get_serial_config, set_serial_config,
)

router = APIRouter(prefix="/api/settings", tags=["settings"])
log = logging.getLogger(__name__)


@router.get("/serial")
def get_serial():
    return get_serial_config().__dict__


@router.put("/serial")
def put_serial(payload: dict = Body(...)):
    current = get_serial_config()
    fields = {**current.__dict__, **payload}
    new_cfg = SerialConfig(**fields)

    errs = new_cfg.validate()
    if errs:
        raise HTTPException(status_code=400, detail="; ".join(errs))

    # Save to disk
    set_serial_config(new_cfg)

    # Apply transport change immediately in the background.
    # We don't await the switch because opening a serial port can take
    # a second or two; we just fire it and let the manager handle it.
    from ..main import manager
    asyncio.create_task(manager.apply_transport(new_cfg.transport))

    return new_cfg.__dict__