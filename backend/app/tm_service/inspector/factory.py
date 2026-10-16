from functools import lru_cache
import logging

from .base import PacketDecoder
from .custom_decoder import CustomDecoder
from .pus_decoder import PusDecoder
from .ebox_decoder import EboxDecoder 

log = logging.getLogger(__name__)

# Registry — adding an OEM decoder later is a one-line change here
_REGISTRY: dict[str, type[PacketDecoder]] = {
    "custom": CustomDecoder,
    "pus": PusDecoder,
    "ebox": EboxDecoder,
    # "oem": OemDecoder,   # future
}


@lru_cache(maxsize=None)
def get_decoder(name: str) -> PacketDecoder:
    cls = _REGISTRY.get(name.lower())
    if cls is None:
        log.warning("Unknown decoder '%s', falling back to 'custom'", name)
        cls = CustomDecoder
    log.info("Using decoder: %s", cls.__name__)
    return cls()