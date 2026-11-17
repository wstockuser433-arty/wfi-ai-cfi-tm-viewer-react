from fastapi import APIRouter
from ..tm_service.registry_ebox import get_ebox_registry

router = APIRouter(prefix="/api", tags=["meta"])

@router.get("/meta")
async def meta():
    reg = get_ebox_registry()
    return reg.meta()