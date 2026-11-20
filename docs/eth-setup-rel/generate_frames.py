#!/usr/bin/env python3
"""Generate full RS-422-wrapped TM frames from the telemetry YAML dictionaries.

Supports inline and block YAML field definitions, enum/bitfield metadata, and
calc-derived fields. Only raw fields are serialized (derived fields are skipped).
"""
import argparse
import math
import struct
import sys
import zlib
from pathlib import Path

try:
    import yaml
except ImportError as exc:
    sys.exit("PyYAML is required: install it with 'python3 -m pip install pyyaml'")

TYPES = {
    "u8": (">B", 1), "u16": (">H", 2), "u24": (None, 3),
    "u32": (">I", 4), "u64": (">Q", 8),
    "i8": (">b", 1), "i16": (">h", 2), "i32": (">i", 4),
    "i64": (">q", 8), "f32": (">f", 4), "f64": (">d", 8),
}

MAX_PAYLOAD = 238
SEQ_FLAGS = 0x03
APID = 0xB2
VERSION = 0x02
OUTER_HEADER = bytes.fromhex("23232A2A")
OUTER_TRAILER = bytes.fromhex("2A2A2323")
DEFAULT_SUB_HDR = 0x01
# Keep existing protocol-specific overrides; all other cards use FAST_TM 0x01.
SUB_HDR_OVERRIDES = {
    "CDPM_R_AI_OBJECT": 0x02,
    "CDPM_R_AI_DCDS": 0x02,
    "CDPM_R_AI_OTA": 0x02,
    "CDPM_R_AI_HEALTH": 0x02,
}

ENUM_DEFAULTS = {
    "cam_clock_locked": 1, "cam_lvds_locked": 1, "ai_health_status": 0,
    "thcc_control_loop_state": 1, "pwr_overcurrent_fault": 0,
    "pwr_efuse_state": 1, "unit_mode": 2, "o2_board_mode": 1,
    "o2_training_status": 0, "startup_status": 0, "image_slot_state": 0,
    "ota_checksum_ok": 1, "ota_rebuild_ok": 1, "can_bus_a_state": 1,
    "can_bus_b_state": 1, "o2_prev_model_type": 0, "o2_curr_model_type": 0,
    "upload_file_check": 0, "target_alg_run_status": 0,
}
FIXED = {
    "pwr_uv_ov_status": 0, "ppc_fault_flags": 0, "ai_model_id": 1,
    "thcc_thermistor_ok": 1, "unit_last_tc_seq": 0,
    "rs422_reset_count": 0, "heat_abnormal_ctr1": 0,
    "heat_abnormal_ctr2": 0, "heat_abnormal_ctr3": 0, "heat_abnormal_ctr4": 0,
    "img_mod1_cmd_err_count": 0, "img_mod2_cmd_err_count": 0,
    "img_mod1_pps_miss_count": 0, "img_mod2_pps_miss_count": 0,
    "cmd_cksum_err_count": 0, "cmd_param_err_count": 0, "cmd_illegal_err_count": 0,
    "tm_forwarding_mask_applied": 0x0F, "tm_forwarding_mask_requested": 0x0F,
}
RANGES = {
    "o2_fpga_rx_count": (1000, 2000), "o2_health_req_rx_count": (10, 50),
    "o2_health_rep_tx_count": (10, 50), "o2_obj_req_rx_count": (10, 50),
    "o2_obj_rep_tx_count": (10, 50), "o2_total_tc_rx": (100, 500),
    "o2_total_tm_tx": (100, 500), "o2_num_models": (1, 3),
    "o2_cpu_temp_int": (30, 60), "o2_cpu_util_int": (10, 80),
    "o2_nvme_used": (10, 50), "o2_num_images_onboard": (100, 2000),
    "o2_unsuccessful_cmd_count": (0, 5), "o2_last_upl_ok_frames": (0, 500),
    "o2_last_upl_bad_frames": (0, 5),
    "fpga_board_temp_c": (35, 55), "fpga_cpu_temp_c": (35, 55),
    "ai_cpu_temp_c": (35, 60), "ai_gpu_temp_c": (35, 65),
    "gpu_st1_temp_c": (30, 50), "gpu_st2_temp_c": (30, 50),
    "power_conv_chip_temp_raw": (1000, 2500),
    "ltm8051_temp_raw": (1000, 2500), "ddr_memory_temp_raw": (1000, 2500),
    "m2s090_temp_raw": (1000, 2500),
}
for i in range(23):
    RANGES.update({f"det{i}_obj_id": (1, 5), f"det{i}_conf": (60, 100),
                  f"det{i}_slice_idx": (0, 7), f"det{i}_lat_int": (-90, 90),
                  f"det{i}_lat_frac": (0, 65535), f"det{i}_lon_int": (-180, 180),
                  f"det{i}_lon_frac": (0, 65535)})


def load_cards(yaml_dir):
    cards = {}
    for path in sorted(Path(yaml_dir).glob("*.yaml")):
        data = yaml.safe_load(path.read_text()) or {}
        for key, card in (data.get("cards") or {}).items():
            fields = card.get("fields") or []
            if fields:
                cards[key] = card
    return cards



def enum_values(enum):
    if isinstance(enum, dict):
        out = {}
        for k, v in enum.items():
            try: out[int(k)] = v
            except (TypeError, ValueError): pass
        return out
    return {}



def pick(card_key, field, seq):
    name, typ = field["name"], field["type"]
    enums = enum_values(field.get("enum"))
    if enums:
        preferred = ENUM_DEFAULTS.get(name)
        return preferred if preferred in enums else min(enums)
    if name in FIXED:
        return FIXED[name]
    if name in RANGES:
        lo, hi = RANGES[name]
        midpoint, amplitude = (lo + hi) / 2, (hi - lo) / 2
        phase = (zlib.crc32(f"{card_key}:{name}".encode()) % 360) * math.pi / 180
        return int(round(midpoint + amplitude * math.sin(seq / 20.0 + phase)))
    if name.startswith("terrain_elevation_"):
        phase = (zlib.crc32(name.encode()) % 360) * math.pi / 180
        return 250 + int(240 * math.sin(seq / 20.0 + phase))
    if name.startswith(("acb_", "acs_")):
        phase = (zlib.crc32(name.encode()) % 360) * math.pi / 180
        return 2.0 * math.sin(seq / 30.0 + phase)
    if field.get("unit") == "cnt":
        return seq % 255
    # Status/bitfield values default to zero unless explicitly configured above.
    return 0.0 if typ in ("f32", "f64") else 0



def raw_fields(card):
    return [f for f in card.get("fields", [])
            if f.get("type") in TYPES and "calc" not in f and "offset" in f]



def build_payload(card, card_key, seq):
    fields = raw_fields(card)
    if not fields:
        return bytes(MAX_PAYLOAD)
    size = max(f["offset"] + TYPES[f["type"]][1] for f in fields)
    if size > MAX_PAYLOAD:
        raise ValueError(f"{card_key}: payload size {size} exceeds {MAX_PAYLOAD} bytes")
    buf = bytearray(size)
    for f in fields:
        typ, n = f["type"], TYPES[f["type"]][1]
        value = pick(card_key, f, seq)
        if typ == "u24":
            v = int(value) & 0xFFFFFF
            raw = bytes([(v >> 16) & 0xFF, (v >> 8) & 0xFF, v & 0xFF])
        else:
            fmt = TYPES[typ][0]
            try: raw = struct.pack(fmt, value)
            except (struct.error, OverflowError) as exc:
                raise ValueError(f"{card_key}.{f['name']}: value {value!r} does not fit {typ}") from exc
        start = f["offset"]
        buf[start:start+n] = raw
    return bytes(buf).ljust(MAX_PAYLOAD, b"\x00")


def checksum8(data):
    return sum(data) & 0xFF



def make_frame(card, card_key, seq):
    uid, sub = int(card["unit_id"]), int(card["unit_sub_id"])
    svc, ssub = int(card["service"]), int(card["subservice"])
    sub_hdr = SUB_HDR_OVERRIDES.get(card_key, DEFAULT_SUB_HDR)
    body = bytes([sub_hdr, uid, sub, svc, ssub]) + build_payload(card, card_key, seq)
    length_field = len(body)
    w0 = (VERSION << 13) | (1 << 11) | APID
    w1 = (SEQ_FLAGS << 14) | (seq & 0x3FFF)
    inner = struct.pack(">HHH", w0, w1, length_field) + body
    return OUTER_HEADER + inner + bytes([checksum8(inner)]) + OUTER_TRAILER



def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("yaml_dir", nargs="?", default="../../backend/app/tm_dictionary",
                   help="directory containing TM dictionary YAML files")
    ap.add_argument("output", nargs="?", default="tm_frames.txt")
    ap.add_argument("rounds", nargs="?", type=int, default=10,
                   help="number of frames per card (default: 10)")
    args = ap.parse_args()
    if args.rounds <= 0:
        ap.error("rounds must be a positive integer")
    cards = load_cards(args.yaml_dir)
    if not cards:
        ap.error(f"no telemetry cards with fields found in {args.yaml_dir}")
    out = Path(args.output)
    total = 0
    with out.open("w") as fh:
        for key in sorted(cards):
            card = cards[key]
            for required in ("unit_id", "unit_sub_id", "service", "subservice"):
                if required not in card:
                    raise ValueError(f"{key}: missing required card metadata {required}")
            fh.write(f"# ===== {key} (unit=0x{int(card['unit_id']):02X} sub=0x{int(card['unit_sub_id']):02X} svc=0x{int(card['service']):02X} subsvc=0x{int(card['subservice']):02X}) =====\n")
            for seq in range(args.rounds):
                fh.write(make_frame(card, key, seq).hex().upper() + "\n")
                total += 1
    print(f"Wrote {total} frames ({len(cards)} cards × {args.rounds} rounds) → {out}")

if __name__ == "__main__":
    main()
