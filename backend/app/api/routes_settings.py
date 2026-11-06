"""
REST endpoints for reading and updating serial config.

`.env` is the source of truth: the backend reads Settings.serial_* on
startup, and PUT writes those fields back to .env then tells the
IngestionManager to switch transport live.

Runtime status (whether the port is currently open, last error) lives in
serial_status.json and is exposed alongside the config for display only.
"""

from __future__ import annotations

import asyncio
import logging
import os
from pathlib import Path
from typing import Any, Dict

from fastapi import APIRouter, Body, HTTPException

from ..tm_service.ingestion.serial_config import get_serial_status
from ..config import settings

router = APIRouter(prefix="/api/settings", tags=["settings"])
log = logging.getLogger(__name__)

# The .env file that Settings loaded. `BaseSettings` resolves `env_file`
# relative to the process CWD; run.py runs from backend/, so this is
# backend/.env. We keep it in one place so writes are predictable.
_ENV_PATH = Path(os.environ.get("DOTENV_PATH", ".env")).resolve()

# Fields the UI is allowed to change. Everything else in Settings stays
# untouched on PUT. Add more here if you expose them later.
_MUTABLE_FIELDS = {
    "serial_enabled",
    "serial_port",
    "serial_baud",
}


# ---------------------------------------------------------------------- #
# Helpers
# ---------------------------------------------------------------------- #
def _effective_config() -> Dict[str, Any]:
    """Merge Settings (config) with SerialStatus (runtime) for display."""
    st = get_serial_status()
    return {
        # ── Configuration (source of truth: .env) ──────────────────────
        "transport": "serial" if settings.serial_enabled else "ethernet",
        "serial_enabled": settings.serial_enabled,
        "port": settings.serial_port,
        "baudrate": settings.serial_baud,
        # Fixed RS-422 params — not user-editable today
        "bytesize": 8,
        "parity": "N",
        "stopbits": 1.0,
        "flow_control": "none",
        "timeout_s": 0.1,
        "read_chunk": 4096,
        # ── Runtime status (source of truth: serial_status.json) ───────
        "status": st.status,
        "last_error": st.last_error,
        "last_error_at": st.last_error_at,
        "opened_port": st.port,
        "opened_baudrate": st.baudrate,
    }


def _coerce_and_validate(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Filter payload to mutable fields, coerce types, validate ranges."""
    clean: Dict[str, Any] = {}

    if "serial_enabled" in payload:
        v = payload["serial_enabled"]
        if isinstance(v, bool):
            clean["serial_enabled"] = v
        elif isinstance(v, str):
            low = v.strip().lower()
            if low in ("true", "1", "yes", "on"):
                clean["serial_enabled"] = True
            elif low in ("false", "0", "no", "off"):
                clean["serial_enabled"] = False
            else:
                raise HTTPException(400, f"serial_enabled: invalid bool {v!r}")
        else:
            raise HTTPException(400, f"serial_enabled: invalid type {type(v).__name__}")

    if "port" in payload:
        v = payload["port"]
        if not isinstance(v, str) or not v.strip():
            raise HTTPException(400, "port must be a non-empty string")
        clean["serial_port"] = v.strip()

    if "baudrate" in payload:
        try:
            v = int(payload["baudrate"])
        except (TypeError, ValueError):
            raise HTTPException(400, "baudrate must be an integer")
        if not (300 <= v <= 4_000_000):
            raise HTTPException(400, f"baudrate {v} out of range 300..4000000")
        clean["serial_baud"] = v

    return clean


def _write_env(updates: Dict[str, Any]) -> None:
    """
    Rewrite keys in .env, preserving everything else (comments, ordering,
    unrelated vars). If .env doesn't exist, create it with just these keys.

    Matching is line-based and key-name-based. Lines matching
    `KEY=...` for a key in `updates` are replaced in place; if a key
    isn't present, it's appended at the end under a comment section.
    """
    env_path = _ENV_PATH
    if not env_path.exists():
        log.warning(".env not found at %s — creating", env_path)
        env_path.touch()

    # Map Settings field name → .env variable name
    field_to_env = {
        "serial_enabled": "SERIAL_ENABLED",
        "serial_port":    "SERIAL_PORT",
        "serial_baud":    "SERIAL_BAUD",
    }
    env_updates = {field_to_env[k]: v for k, v in updates.items() if k in field_to_env}

    # Serialize bools as lowercase true/false (pydantic-settings accepts both)
    def _fmt(v: Any) -> str:
        if isinstance(v, bool):
            return "true" if v else "false"
        return str(v)

    lines = env_path.read_text(encoding="utf-8").splitlines(keepends=True)
    found: set[str] = set()
    out: list[str] = []

    for line in lines:
        stripped = line.lstrip()
        # Preserve comments and blank lines
        if not stripped or stripped.startswith("#"):
            out.append(line)
            continue
        # Match `KEY=...` or `KEY = ...`
        if "=" in line:
            key = line.split("=", 1)[0].strip()
            if key in env_updates:
                out.append(f"{key}={_fmt(env_updates[key])}\n")
                found.add(key)
                continue
        out.append(line)

    # Append any keys that weren't present
    missing = [k for k in env_updates if k not in found]
    if missing:
        if out and not out[-1].endswith("\n"):
            out.append("\n")
        out.append("\n# Serial (updated via API)\n")
        for k in missing:
            out.append(f"{k}={_fmt(env_updates[k])}\n")

    env_path.write_text("".join(out), encoding="utf-8")
    log.info("Wrote %s: %s", env_path, ", ".join(f"{k}={_fmt(v)}" for k, v in env_updates.items()))


def _sync_settings_from_updates(updates: Dict[str, Any]) -> None:
    """Mutate the in-memory Settings object so GET returns the new values immediately."""
    for k, v in updates.items():
        setattr(settings, k, v)


# ---------------------------------------------------------------------- #
# Routes
# ---------------------------------------------------------------------- #
@router.get("/serial")
async def get_serial() -> Dict[str, Any]:
    """Return the effective config (from Settings/.env) + runtime status."""
    return _effective_config()


@router.put("/serial")
async def put_serial(payload: Dict[str, Any] = Body(...)) -> Dict[str, Any]:
    """
    Update serial settings. Accepted keys: serial_enabled, port, baudrate.

    Writes the new values to .env, updates the in-memory Settings object,
    and asks the IngestionManager to switch transport accordingly.
    """
    updates = _coerce_and_validate(payload)
    if not updates:
        raise HTTPException(400, "no mutable fields in payload")

    # 1. Persist to .env
    try:
        _write_env(updates)
    except OSError as e:
        log.exception("Failed to write .env")
        raise HTTPException(500, f"failed to persist settings: {e}")

    # 2. Reflect immediately in this process (Settings is a singleton)
    _sync_settings_from_updates(updates)

    # 3. Ask the manager to switch transport / reopen the port
    from ..main import manager  # lazy import to avoid circular import
    if manager is not None:
        desired = "serial" if settings.serial_enabled else "ethernet"
        asyncio.get_running_loop().create_task(_apply_transport_safe(manager, desired))

    return _effective_config()


async def _apply_transport_safe(manager, transport: str) -> None:
    """Apply the transport switch; log but never raise."""
    try:
        await manager.apply_transport(transport)
    except Exception:
        log.exception("Transport switch to %s failed", transport)