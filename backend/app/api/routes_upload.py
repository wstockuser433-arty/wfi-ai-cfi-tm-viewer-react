import json
import logging
import os
import tempfile
import time
from pathlib import Path

from fastapi import APIRouter, UploadFile, File
from fastapi.encoders import jsonable_encoder
from starlette.concurrency import run_in_threadpool

from ..config import settings
from ..tm_service.inspector.factory import get_decoder
from ..tm_service.ingestion.rs422_framer import Rs422Framer

router = APIRouter(prefix="/api", tags=["upload"])

_log = logging.getLogger(__name__)

# backend/data/offline_dump.json  (this file is backend/app/api/routes_upload.py)
DUMP_PATH = Path(__file__).resolve().parents[2] / "data" / "offline_dump.json"


def _write_dump(packets: list) -> None:
    """Atomic overwrite: write a temp file next to the target, then rename over it."""
    DUMP_PATH.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=DUMP_PATH.parent, suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            json.dump(packets, fh)
        os.replace(tmp, DUMP_PATH)
    except BaseException:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise


def _read_dump() -> list:
    try:
        with open(DUMP_PATH, "r", encoding="utf-8") as fh:
            data = json.load(fh)
    except FileNotFoundError:
        return []
    except json.JSONDecodeError:
        _log.warning("Offline dump %s is not valid JSON; ignoring it", DUMP_PATH)
        return []
    return data if isinstance(data, list) else []


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

    # Persist as the single "offline dump" (overwrites the previous one) so every
    # browser talking to this backend sees the same dump. An upload that decodes
    # to 0 packets does NOT overwrite the existing dump.
    saved = False
    if packets:
        try:
            await run_in_threadpool(_write_dump, jsonable_encoder(packets))
            saved = True
        except Exception:
            _log.exception("Failed to save offline dump to %s", DUMP_PATH)

    return {"count": len(packets), "packets": packets, "saved": saved}


@router.get("/offline-dump")
async def get_offline_dump():
    packets = await run_in_threadpool(_read_dump)
    return {"count": len(packets), "packets": packets}


@router.delete("/offline-dump")
async def delete_offline_dump():
    try:
        DUMP_PATH.unlink()
    except FileNotFoundError:
        pass
    return {"ok": True}