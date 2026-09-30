from fastapi import APIRouter
from ..tm_service.registry import get_registry

router = APIRouter(prefix="/api", tags=["meta"])

@router.get("/meta")
def meta():
    return get_registry().meta()