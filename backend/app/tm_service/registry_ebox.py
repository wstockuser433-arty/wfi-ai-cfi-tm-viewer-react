"""
EBOX Registry
=============

Loads every `*.yaml` file under `app/tm_dictionary/` and exposes fast
lookup by the 4-tuple (unit_id, unit_sub_id, service, subservice).

Each yaml file represents one subsystem (or one subservice of a subsystem).
The filename is used only for logging — the authoritative source of truth
for the 4-tuple is the `unit_sub_id` / `service` / `subservice` fields
inside the card definitions themselves.

Unlike the standard TmRegistry (which is keyed by APID), the EBOX
protocol multiplexes all telemetry through a single APID (0x2B) and
discriminates by the 4-tuple.
"""

from __future__ import annotations

import logging
import re
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
SAFE_CALC_RE = re.compile(
    r"^(?:[A-Za-z_][A-Za-z0-9_]*(?:\(D\))?"
    r"|D(?:\s*[+\-*/]\s*[\d.]+)+"
    r"|[\d.]+(?:\s*[+\-*/]\s*D)+"
    r"|[\d.]+(?:\s*[+\-*/]\s*[\d.]+)+)$"
)


# ─── Subsystem display metadata ────────────────────────────────────────
SUBSYSTEM_LABELS = {
    "CAMERA": "Camera Subsystem",
    "CTPU": "CTPU",
    "CDPM_P": "CDPM (Primary)",
    "CDPM_R": "CDPM (Redundant)",
    "EBOX": "EBOX",
}
SUBSYSTEM_COLORS = {
    "CAMERA": "#8494DA",      # Match colors.ts
    "CTPU": "#FFB020",
    "CDPM_P": "#22C55E",
    "CDPM_R": "#F59E0B",
    "EBOX": "#8B95A9",
}


class EboxRegistry:
    def __init__(self) -> None:
        self.unit: dict[str, Any] = {}
        self.cards: dict[str, dict[str, Any]] = {}
        self.quad_map: dict[tuple[int, int, int, int], dict[str, Any]] = {}
        self._load()

    # ------------------------------------------------------------------ #
    def _load(self) -> None:
        yaml_files = sorted(DICT_DIR.glob("*.yaml"))
        if not yaml_files:
            raise FileNotFoundError(
                f"No *.yaml files found in {DICT_DIR}. "
                f"Create at least one TM dictionary file."
            )

        log.info("Loading %d TM dictionary file(s) from %s", len(yaml_files), DICT_DIR)

        # Remember the first non-empty `unit:` block — it becomes the
        # top-level `unit` in `meta()`. Subsystem-specific unit labels
        # are stored per-card.
        first_unit_block: dict[str, Any] | None = None

        for path in yaml_files:
            try:
                with open(path, "r", encoding="utf-8") as fh:
                    data = yaml.safe_load(fh) or {}
            except Exception as e:
                log.exception("Failed to parse %s: %s", path.name, e)
                raise

            file_unit = data.get("unit") or {}
            if first_unit_block is None and file_unit:
                first_unit_block = file_unit

            cards = data.get("cards") or {}
            if not cards:
                log.info("  %s — no cards (placeholder file)", path.name)
                continue

            for card_key, card in cards.items():
                self._register_card(
                    file_name=path.name,
                    file_unit=file_unit,
                    card_key=card_key,
                    card=card,
                )

        self.unit = first_unit_block or {"id": 0x1A, "label": "EBOX"}

        # Guard against duplicated card keys across files. Card keys are
        # unique in YAML by definition, but two files could both define
        # `CAMERA_UNIT_STATUS`. That would silently merge or overwrite —
        # raise so the developer notices.
        self._validate()
        log.info(
            "EBOX registry loaded: %d cards, %d unique 4-tuples, %d subsystems",
            len(self.cards),
            len(self.quad_map),
            len({c["subsystem"] for c in self.cards.values()}),
        )

    # ------------------------------------------------------------------ #
    def _register_card(
        self,
        file_name: str,
        file_unit: dict[str, Any],
        card_key: str,
        card: dict[str, Any],
    ) -> None:
        if not isinstance(card, dict):
            raise ValueError(f"{file_name}: card '{card_key}' must be a mapping")

        # Card-level unit_id wins; fall back to file-level `unit.id`
        if "unit_id" not in card:
            if "id" not in file_unit:
                raise ValueError(
                    f"{file_name}: card '{card_key}' has no `unit_id` and "
                    f"the file's `unit:` block has no `id`"
                )
            card = {**card, "unit_id": file_unit["id"]}

        for req in ("unit_id", "unit_sub_id", "service", "subservice"):
            if req not in card:
                raise ValueError(f"{file_name}: card '{card_key}' missing '{req}'")

        quad = (
            int(card["unit_id"]),
            int(card["unit_sub_id"]),
            int(card["service"]),
            int(card["subservice"]),
        )
        if quad in self.quad_map:
            raise ValueError(
                f"{file_name}: duplicate 4-tuple {quad} "
                f"({card_key} vs {self.quad_map[quad]['card']})"
            )

        if card_key in self.cards:
            raise ValueError(
                f"{file_name}: duplicate card key '{card_key}' "
                f"(already defined in {self.cards[card_key]['file']})"
            )

        entry = {
            **card,
            "card": card_key,
            "card_label": card.get("label", card_key),
            "subsystem": card.get("subsystem", file_unit.get("label", "EBOX")),
            "hw_class": card.get("hw_class", "HW"),
            "file": file_name,
        }
        self.cards[card_key] = entry
        self.quad_map[quad] = entry

    # ------------------------------------------------------------------ #
    def _validate(self) -> None:
        for card_key, card in self.cards.items():
            fields = card.get("fields", [])
            if not isinstance(fields, list):
                raise ValueError(
                    f"{card['file']}: card '{card_key}': fields must be a list"
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
                f"{card_key}[{idx}]: field must be a mapping, "
                f"got {type(f).__name__}"
            )
        for k in ("name", "offset", "type"):
            if k not in f:
                raise ValueError(f"{card_key}[{idx}] missing '{k}'")

        typ = f["type"]
        if typ not in VALID_TYPES:
            raise ValueError(f"{card_key}.{f['name']}: bad type '{typ}'")

        # ── calc fields: derived views, share bytes with parent ─────────
        from .inspector.ebox_calcs import CALC_FUNCS
        if "calc" in f:
            calc = str(f["calc"]).strip()
            if calc not in CALC_FUNCS:
                raise ValueError(
                    f"{card_key}.{f['name']}: unknown calc function "
                    f"'{calc}' (valid: {sorted(CALC_FUNCS)})"
                )
            if "calc_from" not in f:
                raise ValueError(
                    f"{card_key}.{f['name']}: 'calc' requires 'calc_from'"
                )
            return  # derived — skip overlap check

        # ── physical field: register its span ──────────────────────────
        start = int(f["offset"])
        end = start + STRUCT_SIZE[typ]
        for (s, e, other) in seen:
            if not (end <= s or start >= e):
                raise ValueError(
                    f"{card_key}: '{f['name']}' overlaps '{other}'"
                )
        seen.append((start, end, f["name"]))

        # ── bitfields ───────────────────────────────────────────────────
        if "bits" in f:
            if typ not in ("u8", "u16", "u32", "u24"):
                raise ValueError(
                    f"{card_key}.{f['name']}: bitfields only supported on "
                    f"u8/u16/u24/u32, got '{typ}'"
                )
            if not isinstance(f["bits"], list):
                raise ValueError(
                    f"{card_key}.{f['name']}: 'bits' must be a list"
                )
            for b in f["bits"]:
                if not isinstance(b, dict) or "name" not in b:
                    raise ValueError(
                        f"{card_key}.{f['name']}: every bit spec must be a "
                        f"mapping with 'name'"
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

        Shape:
            {
              "unit": { "id": int, "label": str },
              "subsystems": {
                "<SUBSYSTEM>": {
                  "label": str,
                  "color": str,
                  "cards": {
                    "<card_key>": {
                      "label": str,
                      "apid": int,
                      "hw_class": str,
                      "fields": [...],
                      "unit_id": int,
                      "unit_sub_id": int,
                      "service": int,
                      "subservice": int,
                    }
                  }
                }
              },
              "links": [],
              "apids": [...],
            }
        """
        subsystems: dict[str, dict[str, Any]] = {}
        apids: list[dict[str, Any]] = []

        # ⭐ 1. Pre-seed the required subsystems so they always show up
        for req in ["CAMERA", "EBOX", "CTPU", "CDPM_P", "CDPM_R"]:
            subsystems[req] = {
                "label": SUBSYSTEM_LABELS.get(req, req),
                "color": SUBSYSTEM_COLORS.get(req, "#8B95A9"),
                "cards": {},
            }

        # 2. Populate with actual cards
        for card_key, card in self.cards.items():
            sub_key = card["subsystem"]
            # In case a YAML defines a subsystem not in our list, add it
            sub = subsystems.setdefault(sub_key, {
                "label": SUBSYSTEM_LABELS.get(sub_key, sub_key),
                "color": SUBSYSTEM_COLORS.get(sub_key, "#8B95A9"),
                "cards": {},
            })

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