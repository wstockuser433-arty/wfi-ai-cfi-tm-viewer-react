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


class TmRegistry:
    def __init__(self) -> None:
        self.subsystems: dict[str, dict[str, Any]] = {}
        self.apid_map: dict[int, dict[str, Any]] = {}
        self.links: dict[str, dict[str, Any]] = {}
        self.link_apid_map: dict[int, dict[str, Any]] = {}
        self._load()

    # ------------------------------------------------------------------ #
    def _load(self) -> None:
        with open(DICT_DIR / "parameters.yaml", "r", encoding="utf-8") as fh:
            data = yaml.safe_load(fh)

        if not isinstance(data, dict) or "subsystems" not in data:
            raise ValueError(
                f"{DICT_DIR / 'parameters.yaml'} must be a mapping with a "
                f"'subsystems' key at the top level"
            )

        for sub_key, sub in data["subsystems"].items():
            self._assert_mapping(sub, f"subsystem '{sub_key}'")
            if "cards" not in sub:
                raise ValueError(f"subsystem '{sub_key}' missing 'cards' key")

            self.subsystems[sub_key] = sub

            for card_key, card in sub["cards"].items():
                self._assert_mapping(card, f"card '{sub_key}.{card_key}'")

                if "apid" not in card:
                    raise ValueError(f"card '{sub_key}.{card_key}' missing 'apid'")
                if "fields" not in card:
                    raise ValueError(f"card '{sub_key}.{card_key}' missing 'fields'")

                entry = {
                    "subsystem": sub_key,
                    "subsystem_label": sub.get("label", sub_key),
                    "color": sub.get("color", "#8B95A9"),
                    "card": card_key,
                    "card_label": card.get("label", card_key),
                    "hw_class": card.get("hw_class", "HW"),
                    "fields": card["fields"],
                    "kind": "subsystem",
                }
                self.apid_map[card["apid"]] = entry

        # --- links ---
        links_path = DICT_DIR / "links.yaml"
        if links_path.exists():
            with open(links_path, "r", encoding="utf-8") as fh:
                links_doc = yaml.safe_load(fh) or {}

            for link in links_doc.get("links", []):
                self._assert_mapping(link, f"link '{link.get('id', '?')}'")
                if "apid" not in link or "fields" not in link:
                    raise ValueError(f"link {link.get('id')} missing apid/fields")

                self.links[link["id"]] = link
                entry = {
                    "subsystem": "LINKS",
                    "subsystem_label": "RS-422 Links",
                    "color": "#A855F7",
                    "card": link["id"],
                    "card_label": link.get("label", link["id"]),
                    "hw_class": "HW",
                    "fields": link["fields"],
                    "kind": "link",
                }
                self.link_apid_map[link["apid"]] = entry
                self.apid_map[link["apid"]] = entry

        self._validate()

    # ------------------------------------------------------------------ #
    @staticmethod
    def _assert_mapping(obj: Any, where: str) -> None:
        if not isinstance(obj, dict):
            raise ValueError(
                f"{where}: expected a mapping (dict), got {type(obj).__name__}: {obj!r}"
            )

    # ------------------------------------------------------------------ #
    def _validate(self) -> None:
        """Raise if any field spec is inconsistent. Loud + precise."""
        for apid, spec in self.apid_map.items():
            fields = spec.get("fields")
            if not isinstance(fields, list):
                raise ValueError(
                    f"APID 0x{apid:X} ({spec['subsystem']}.{spec['card']}): "
                    f"'fields' must be a list, got {type(fields).__name__}"
                )

            seen: list[tuple[int, int, str]] = []

            for idx, f in enumerate(fields):
                # Catches the exact bug you hit: a field that's a bare string.
                if not isinstance(f, dict):
                    raise ValueError(
                        f"APID 0x{apid:X} ({spec['subsystem']}.{spec['card']}): "
                        f"field[{idx}] must be a mapping with name/offset/type, "
                        f"got {type(f).__name__}: {f!r}"
                    )

                for key in ("name", "offset", "type"):
                    if key not in f:
                        raise ValueError(
                            f"APID 0x{apid:X} ({spec['subsystem']}.{spec['card']}): "
                            f"field[{idx}] {f!r} missing '{key}'"
                        )

                ftype = f["type"]
                if ftype not in VALID_TYPES:
                    raise ValueError(
                        f"APID 0x{apid:X} field '{f['name']}': bad type '{ftype}'. "
                        f"Valid: {sorted(VALID_TYPES)}"
                    )

                start = int(f["offset"])
                end = start + STRUCT_SIZE[ftype]

                for (s, e, other) in seen:
                    if not (end <= s or start >= e):
                        raise ValueError(
                            f"APID 0x{apid:X}: field '{f['name']}' "
                            f"({start}-{end}) overlaps '{other}' ({s}-{e})"
                        )
                seen.append((start, end, f["name"]))

    # ------------------------------------------------------------------ #
    def lookup(self, apid: int) -> dict[str, Any] | None:
        return self.apid_map.get(apid)

    def meta(self) -> dict[str, Any]:
        return {
            "subsystems": self.subsystems,
            "links": list(self.links.values()),
            "apids": [
                {"apid": k, "subsystem": v["subsystem"],
                 "card": v["card"], "label": v["card_label"]}
                for k, v in self.apid_map.items()
            ],
        }


@lru_cache
def get_registry() -> TmRegistry:
    return TmRegistry()