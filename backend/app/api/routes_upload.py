import json
import time

from fastapi import APIRouter, UploadFile, File

from ..config import settings
from ..tm_service.inspector.factory import get_decoder
from ..tm_service.ingestion.rs422_framer import Rs422Framer

router = APIRouter(prefix="/api", tags=["upload"])


@router.post("/upload")
async def upload(file: UploadFile = File(...)):
    data = await file.read()
    decoder = get_decoder(settings.tm_decoder)
    packets = []

    # ─── Detect format by content, not filename ──────────────────────
    # JSON dumps start with '[' (array) or '{' (object).
    # Binary EBOX frames start with 0x23 0x23 0x2A 0x2A.
    is_json = data[:1] in (b"[", b"{")

    if is_json:
        # ⭐ Handle JSON export (preserves timestamps)
        try:
            json_data = json.loads(data)
            for item in json_data:
                raw_hex = item.get("raw_hex")
                ts = item.get("ts")
                if raw_hex and ts:
                    raw_bytes = bytes.fromhex(raw_hex)
                    pkt_dict = decoder.decode(raw_bytes, float(ts))
                    packets.append(pkt_dict)
        except Exception as e:
            return {
                "error": f"Failed to parse JSON: {e}",
                "count": 0,
                "packets": [],
            }
    else:
        # ⭐ Handle raw binary (.bin / .dump)
        # Expects the EBOX wire format: 23 23 2A 2A ... 2A 2A 23 23
        framer = Rs422Framer()
        frames = framer.feed(data)

        now = time.time()
        for raw_frame in frames:
            try:
                pkt_dict = decoder.decode(raw_frame, now)
                packets.append(pkt_dict)
            except ValueError as e:
                # Skip malformed frames (e.g., a TC packet sneaking in)
                import logging
                logging.getLogger(__name__).warning(
                    "Skipping malformed frame (%d bytes): %s", len(raw_frame), e
                )
                continue

    return {"count": len(packets), "packets": packets}