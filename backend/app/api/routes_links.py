from fastapi import APIRouter
from ..tm_service.registry import get_registry

router = APIRouter(prefix="/api", tags=["links"])


@router.get("/links")
def list_links():
    reg = get_registry()
    return {"links": list(reg.links.values())}