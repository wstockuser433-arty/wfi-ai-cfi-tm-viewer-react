from fastapi import APIRouter, UploadFile, File
from ..tm_service.inspector.decoder import decode
from ..tm_service.ingestion.depacketizer import StreamDepacketizer
import time

router = APIRouter(prefix="/api", tags=["upload"])

@router.post("/upload")
async def upload(file: UploadFile = File(...)):
    data = await file.read()
    depkt = StreamDepacketizer()
    packets = [decode(f, time.time()) for f in depkt.feed(data)]
    return {"count": len(packets), "packets": packets}