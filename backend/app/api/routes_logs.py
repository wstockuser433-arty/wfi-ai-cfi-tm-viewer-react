"""REST endpoint to download or query the log file."""

from fastapi import APIRouter, Query
from fastapi.responses import FileResponse
from pathlib import Path

from ..logging_config import LOG_FILE

router = APIRouter(prefix="/api/logs", tags=["logs"])


@router.get("/tail")
def tail(n: int = Query(200, le=5000)):
    """Return the last N lines of the current log file."""
    if not LOG_FILE.exists():
        return {"lines": []}
    with open(LOG_FILE, "r", encoding="utf-8", errors="replace") as fh:
        lines = fh.readlines()
    return {"lines": [l.rstrip("\n") for l in lines[-n:]]}


@router.get("/download")
def download():
    if not LOG_FILE.exists():
        return {"error": "no log file yet"}
    return FileResponse(LOG_FILE, filename="tm-viewer.log")