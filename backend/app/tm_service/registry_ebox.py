"""
EBOX Registry
=============

Loads `app/tm_dictionary/ebox.yaml` and exposes fast lookup by the
4-tuple (unit_id, unit_sub_id, service, subservice).

Unlike the standard TmRegistry (which is keyed by APID), the EBOX
protocol multiplexes all telemetry through a single APID (0x2B) and
discriminates by the 4-tuple.
"""

from __future__ import annotations

import logging
from functools import lru_cache
from pathlib import Path
from typing import Any

import yaml

log = logging.getLogger(__name__)

DICT_DIR = Path(__file__).parent.parent / "tm_dictionary"

VALID_TYPES = {"f32", "f64", "u8", "u16", "u32", "u24", "i8", "i16", "i32"}
STRUCT_SIZE = {
    "f32": 4, "f64": 8,
    "u8": 1, "u16": 2, "u32": 4, "u24": 3,
    "i8": 1, "i16": 2, "i32": 4,
}

# Calc expressions are validated against this whitelist. Anything not
# matching is rejected at load time so we never feed arbitrary strings
# into the calculator.
import re
SAFE_CALC_RE = re.compile(
    r"^(?:[A-Za-z_][A-Za-z0-9_]*(?:\(D\))?"
    r"|D(?:\s*[+\-*/]\s*[\d.]+)+"
    r"|[\d.]+(?:\s*[+\-*/]\s*D)+"
    r"|[\d.]+(?:\s*[+\-*/]\s*[\d.]+)+)$"
)


class EboxRegistry:
    def __init__(self) -> None:
        self.unit: dict[str, Any] = {}
        self.cards: dict[str, dict[str, Any]] = {}
        self.quad_map: dict[tuple[int, int, int, int], dict[str, Any]] = {}
        self._load()

    # ------------------------------------------------------------------ #
    def _load(self) -> None:
        path = DICT_DIR / "ebox.yaml"
        if not path.exists():
            raise FileNotFoundError(
                f"EBOX dictionary not found at {path}. "
                f"Create it or set TM_DECODER to a different value."
            )

        with open(path, "r", encoding="utf-8") as fh:
            data = yaml.safe_load(fh)

        self.unit = data.get("unit", {}) or {}
        cards = data.get("cards", {}) or {}

        for card_key, card in cards.items():
            if not isinstance(card, dict):
                raise ValueError(f"ebox.yaml card '{card_key}' must be a mapping")

            for req in ("unit_id", "unit_sub_id", "service", "subservice"):
                if req not in card:
                    raise ValueError(
                        f"ebox.yaml card '{card_key}' missing '{req}'"
                    )

            quad = (
                int(card["unit_id"]),
                int(card["unit_sub_id"]),
                int(card["service"]),
                int(card["subservice"]),
            )
            if quad in self.quad_map:
                raise ValueError(
                    f"ebox.yaml duplicate 4-tuple {quad} "
                    f"({card_key} vs {self.quad_map[quad]['card']})"
                )

            entry = {
                **card,
                "card": card_key,
                "card_label": card.get("label", card_key),
                "subsystem": card.get("subsystem", "EBOX"),
                "hw_class": card.get("hw_class", "HW"),
            }
            self.cards[card_key] = entry
            self.quad_map[quad] = entry

        self._validate()
        log.info(
            "EBOX registry loaded: %d cards, %d unique 4-tuples",
            len(self.cards), len(self.quad_map),
        )

    # ------------------------------------------------------------------ #
    def _validate(self) -> None:
        for card_key, card in self.cards.items():
            fields = card.get("fields", [])
            if not isinstance(fields, list):
                raise ValueError(
                    f"ebox.yaml card '{card_key}': fields must be a list"
                )

            seen: list[tuple[int, int, str]] = []
            for idx, f in enumerate(fields):
                self._validate_field(card_key, idx, f, seen)

    @staticmethod
    def _validate_field(
        card_key: str,
        idx: int,
        f: Any,
        seen: list[tuple[int, int, str]],
    ) -> None:
        if not isinstance(f, dict):
            raise ValueError(
                f"ebox.yaml {card_key}[{idx}]: field must be a mapping, "
                f"got {type(f).__name__}"
            )
        for k in ("name", "offset", "type"):
            if k not in f:
                raise ValueError(f"ebox.yaml {card_key}[{idx}] missing '{k}'")

        typ = f["type"]
        if typ not in VALID_TYPES:
            raise ValueError(
                f"ebox.yaml {card_key}.{f['name']}: bad type '{typ}'"
            )

        # Fields with `calc:` are *derived* views of another field.
        # They share the payload bytes of their `calc_from` parent,
        # so they don't need to be registered in the occupancy map.
        from .inspector.ebox_calcs import CALC_FUNCS
        if "calc" in f:
            calc = str(f["calc"]).strip()
            if calc not in CALC_FUNCS:
                raise ValueError(
                    f"ebox.yaml {card_key}.{f['name']}: unknown calc function "
                    f"'{calc}' (valid: {sorted(CALC_FUNCS)})"
                )
            if "calc_from" not in f:
                raise ValueError(
                    f"ebox.yaml {card_key}.{f['name']}: 'calc' requires 'calc_from'"
                )
            return
        
        if "calc" in f:
            # Still validate the calc expression itself
            calc = str(f["calc"]).strip()
            if not SAFE_CALC_RE.match(calc):
                raise ValueError(
                    f"ebox.yaml {card_key}.{f['name']}: unsafe calc expr "
                    f"'{calc}' (must be a whitelisted function or simple "
                    f"arithmetic of D)"
                )
            if "calc_from" not in f:
                raise ValueError(
                    f"ebox.yaml {card_key}.{f['name']}: 'calc' requires 'calc_from'"
                )
            return  # skip overlap check — derived field

        # Otherwise validate as a normal physical field
        start = int(f["offset"])
        end = start + STRUCT_SIZE[typ]
        for (s, e, other) in seen:
            if not (end <= s or start >= e):
                raise ValueError(
                    f"ebox.yaml {card_key}: '{f['name']}' overlaps '{other}'"
                )
        seen.append((start, end, f["name"]))

        # ── bitfield validation (unchanged) ───────────────────────────────
        if "bits" in f:
            if typ not in ("u8", "u16", "u32", "u24"):
                raise ValueError(
                    f"ebox.yaml {card_key}.{f['name']}: bitfields only "
                    f"supported on u8/u16/u24/u32, got '{typ}'"
                )
            if not isinstance(f["bits"], list):
                raise ValueError(
                    f"ebox.yaml {card_key}.{f['name']}: 'bits' must be a list"
                )
            for b in f["bits"]:
                if not isinstance(b, dict) or "name" not in b:
                    raise ValueError(
                        f"ebox.yaml {card_key}.{f['name']}: every bit "
                        f"spec must be a mapping with 'name'"
                    )

        # ── calc validation ─────────────────────────────────────────
        if "calc" in f:
            calc = str(f["calc"]).strip()
            if not SAFE_CALC_RE.match(calc):
                raise ValueError(
                    f"ebox.yaml {card_key}.{f['name']}: unsafe calc expr "
                    f"'{calc}' (must be a whitelisted function or simple "
                    f"arithmetic of D)"
                )
            if "calc_from" not in f:
                raise ValueError(
                    f"ebox.yaml {card_key}.{f['name']}: 'calc' requires "
                    f"'calc_from'"
                )

        # ── bitfield validation ─────────────────────────────────────
        if "bits" in f:
            if typ not in ("u8", "u16", "u32", "u24"):
                raise ValueError(
                    f"ebox.yaml {card_key}.{f['name']}: bitfields only "
                    f"supported on u8/u16/u24/u32, got '{typ}'"
                )
            if not isinstance(f["bits"], list):
                raise ValueError(
                    f"ebox.yaml {card_key}.{f['name']}: 'bits' must be a list"
                )
            for b in f["bits"]:
                if not isinstance(b, dict) or "name" not in b:
                    raise ValueError(
                        f"ebox.yaml {card_key}.{f['name']}: every bit "
                        f"spec must be a mapping with 'name'"
                    )

    # ------------------------------------------------------------------ #
    def lookup(
        self,
        unit_id: int,
        unit_sub_id: int,
        service: int,
        subservice: int,
    ) -> dict[str, Any] | None:
        return self.quad_map.get(
            (int(unit_id), int(unit_sub_id), int(service), int(subservice))
        )

    # ------------------------------------------------------------------ #
    def meta(self) -> dict[str, Any]:
        """
        Frontend /api/meta payload.

        Shape matches TmRegistry.meta() so the existing React UI works
        unchanged:
            {
              "subsystems": {...},
              "links": [],
              "apids": [...],
              "unit": { "id": int, "label": str },
            }
        """
        SUBSYSTEM_LABELS = {
            "CAMERA": "Camera Subsystem",
            "CTPU": "CTPU",
            "CDPM_P": "CDPM (Primary)",
            "CDPM_R_AI": "CDPM (Redundant) AI",
            "CDPM_R_FPGA": "CDPM (Redundant) FPGA",
            "EBOX": "EBOX",
        }
        SUBSYSTEM_COLORS = {
            "CAMERA": "#00E5FF",
            "CTPU": "#22C55E",
            "CDPM_P": "#16A34A",
            "CDPM_R_AI": "#FFB020",
            "CDPM_R_FPGA": "#F59E0B",
            "EBOX": "#8B95A9",
        }

        subsystems: dict[str, dict[str, Any]] = {}
        apids: list[dict[str, Any]] = []

        for card_key, card in self.cards.items():
            sub_key = card["subsystem"]
            sub = subsystems.setdefault(sub_key, {
                "label": SUBSYSTEM_LABELS.get(sub_key, sub_key),
                "color": SUBSYSTEM_COLORS.get(sub_key, "#8B95A9"),
                "cards": {},
            })

            # Frontend keys everything off `card.apid`. For EBOX we use
            # unit_sub_id as the key, matching what EboxDecoder emits.
            apid_key = int(card["unit_sub_id"])

            sub["cards"][card_key] = {
                "label": card["card_label"],
                "apid": apid_key,
                "hw_class": card.get("hw_class", "HW"),
                "fields": card.get("fields", []),
                "unit_id": int(card["unit_id"]),
                "unit_sub_id": int(card["unit_sub_id"]),
                "service": int(card["service"]),
                "subservice": int(card["subservice"]),
            }

            apids.append({
                "apid": apid_key,
                "subsystem": sub_key,
                "card": card_key,
                "label": card["card_label"],
                "unit_id": int(card["unit_id"]),
                "unit_sub_id": int(card["unit_sub_id"]),
                "service": int(card["service"]),
                "subservice": int(card["subservice"]),
            })

        return {
            "unit": self.unit,
            "subsystems": subsystems,
            "links": [],
            "apids": apids,
        }


@lru_cache
def get_ebox_registry() -> EboxRegistry:
    return EboxRegistry()