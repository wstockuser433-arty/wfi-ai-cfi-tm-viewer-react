"""
EBOX Registry
=============

Loads `app/tm_dictionary/ebox.yaml` and exposes fast lookup by the
3-tuple (unit_sub_id, service, subservice).

Unlike the standard TmRegistry (which is keyed by APID), the EBOX
protocol multiplexes all telemetry through a single APID (0x2B) and
discriminates by the (Unit Sub ID, Service, Sub-Service) triple.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Any

import yaml

DICT_DIR = Path(__file__).parent.parent / "tm_dictionary"

VALID_TYPES = {"f32", "f64", "u8", "u16", "u32", "i8", "i16", "i32"}
STRUCT_SIZE = {
    "f32": 4, "f64": 8,
    "u8": 1, "u16": 2, "u32": 4,
    "i8": 1, "i16": 2, "i32": 4,
}


class EboxRegistry:
    def __init__(self) -> None:
        self.unit: dict[str, Any] = {}
        self.cards: dict[str, dict[str, Any]] = {}
        self.triple_map: dict[tuple[int, int, int], dict[str, Any]] = {}
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

            for req in ("unit_sub_id", "service", "subservice"):
                if req not in card:
                    raise ValueError(f"ebox.yaml card '{card_key}' missing '{req}'")

            triple = (
                int(card["unit_sub_id"]),
                int(card["service"]),
                int(card["subservice"]),
            )
            if triple in self.triple_map:
                raise ValueError(
                    f"ebox.yaml duplicate triple {triple} "
                    f"({card_key} vs {self.triple_map[triple]['card']})"
                )

            entry = {
                **card,
                "card": card_key,
                "card_label": card.get("label", card_key),
                "subsystem": card.get("subsystem", "EBOX"),
                "hw_class": card.get("hw_class", "HW"),
            }
            self.cards[card_key] = entry
            self.triple_map[triple] = entry

        self._validate()

    # ------------------------------------------------------------------ #
    def _validate(self) -> None:
        for card_key, card in self.cards.items():
            fields = card.get("fields", [])
            if not isinstance(fields, list):
                raise ValueError(f"ebox.yaml card '{card_key}': fields must be a list")

            seen: list[tuple[int, int, str]] = []
            for idx, f in enumerate(fields):
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
                start = int(f["offset"])
                end = start + STRUCT_SIZE[typ]
                for (s, e, other) in seen:
                    if not (end <= s or start >= e):
                        raise ValueError(
                            f"ebox.yaml {card_key}: '{f['name']}' "
                            f"overlaps '{other}'"
                        )
                seen.append((start, end, f["name"]))

    # ------------------------------------------------------------------ #
    def lookup(self, unit_sub_id: int, service: int, subservice: int) -> dict[str, Any] | None:
        return self.triple_map.get((unit_sub_id, service, subservice))

    # ------------------------------------------------------------------ #
    def meta(self) -> dict[str, Any]:
        """Frontend /api/meta payload for the EBOX decoder."""
        apids = []
        for card_key, card in self.cards.items():
            apids.append({
                "apid": int(card["unit_sub_id"]),  # UI uses this as a key
                "subsystem": card["subsystem"],
                "card": card_key,
                "label": card["card_label"],
                "unit_sub_id": int(card["unit_sub_id"]),
                "service": int(card["service"]),
                "subservice": int(card["subservice"]),
            })

        return {
            "unit": self.unit,
            "apids": apids,
            "cards": self.cards,
        }


@lru_cache
def get_ebox_registry() -> EboxRegistry:
    return EboxRegistry()