from fastapi import APIRouter

from ..config import settings
from ..tm_service.registry import get_registry
from ..tm_service.registry_ebox import get_ebox_registry

router = APIRouter(prefix="/api", tags=["meta"])


@router.get("/meta")
def meta():
    """
    Returns the active TM dictionary.

    The shape depends on the active decoder:
      - 'ebox': triple-keyed (unit_sub_id, service, subservice) mapping,
                served by EboxRegistry. Frontend uses `apids[].unit_sub_id`
                as the dropdown key.
      - others: APID-keyed mapping served by TmRegistry (existing behavior).
    """
    if settings.tm_decoder.lower() == "ebox":
        return get_ebox_registry().meta()
    return get_registry().meta()