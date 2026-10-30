"""REST endpoints for reading and updating serial config."""

from fastapi import APIRouter, Body, HTTPException

from ..tm_service.ingestion.serial_config import (
    SerialConfig, get_serial_config, set_serial_config,
)

router = APIRouter(prefix="/api/settings", tags=["settings"])


@router.get("/serial")
def get_serial():
    return get_serial_config().__dict__


@router.put("/serial")
def put_serial(payload: dict = Body(...)):
    current = get_serial_config()
    # Merge into current
    fields = {**current.__dict__, **payload}
    new_cfg = SerialConfig(**fields)

    errs = new_cfg.validate()
    if errs:
        raise HTTPException(status_code=400, detail="; ".join(errs))

    set_serial_config(new_cfg)

    # Apply transport change immediately
    from ..main import manager
    import asyncio
    asyncio.create_task(manager.apply_transport(new_cfg.transport))

    return new_cfg.__dict__