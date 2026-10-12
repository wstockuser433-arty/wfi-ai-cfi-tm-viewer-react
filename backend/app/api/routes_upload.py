import time

from fastapi import APIRouter, UploadFile, File

from ..config import settings
from ..tm_service.inspector.factory import get_decoder
from ..tm_service.ingestion.depacketizer import StreamDepacketizer

router = APIRouter(prefix="/api", tags=["upload"])


@router.post("/upload")
async def upload(file: UploadFile = File(...)):
    data = await file.read()

    # Same decoder the live pipeline is using — keeps behavior consistent
    decoder = get_decoder(settings.tm_decoder)

    depkt = StreamDepacketizer()
    packets = [decoder.decode(f, time.time()) for f in depkt.feed(data)]
    return {"count": len(packets), "packets": packets}