#!/usr/bin/env python3
"""Generate full RS-422-wrapped TM frames from the telemetry YAML dictionaries.

Payload sizes are per-card (see PAYLOAD_SIZES). Cards with pad=True are
zero/0xFF padded to their declared size; others emit only their natural
field extent. The MAX_PAYLOAD ceiling (237 B) is still enforced.
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

# ⭐ Per-card payload sizes. pad=True → fill to exactly `size` bytes.
#    pad=False → emit natural field extent (may be smaller than `size`).
PAYLOAD_SIZES = {
    "CAMERA_UNIT_STATUS":        {"size": 131, "pad": False},
    "CAMERA_SLOW_STATUS":        {"size": 144, "pad": False},
    "CAMERA_MOTION_CALC":        {"size":  69, "pad": False},
    "CAMERA_MOTION_COEFF":       {"size": 118, "pad": False},
    "CAMERA_TERRAIN_ELEV":       {"size": 230, "pad": False},
    "CAMERA_UPLINK_RESULT_1":    {"size": 230, "pad": False},
    "CAMERA_UPLINK_RESULT_2":    {"size": 231, "pad": False},
    "CAMERA_TIME_SYNC":          {"size":   5, "pad": False},
    "CAMERA_GNC_BROADCAST":      {"size": 102, "pad": False},
    "CDPM_P_FAST":               {"size": 141, "pad": False},
    "CDPM_P_SLOW":               {"size":  92, "pad": False},
    "CTPU_TM":                   {"size": 237, "pad": False},
    "CDPM_R_AI_OBJECT":          {"size": 237, "pad": False},
    "CDPM_R_AI_DCDS":            {"size": 237, "pad": True},   # pad to 237 with 0xFF
    "CDPM_R_AI_OTA":             {"size": 237, "pad": False},
    "CDPM_R_AI_HEALTH":          {"size": 237, "pad": True},   # pad to 237 with 0xFF
}

MAX_PAYLOAD = 237
SEQ_FLAGS = 0x03
APID = 0xB2
VERSION = 0x02
OUTER_HEADER = bytes.fromhex("23232A2A")
OUTER_TRAILER = bytes.fromhex("2A2A2323")
DEFAULT_SUB_HDR = 0x01
SUB_HDR_OVERRIDES = {
    "CDPM_R_AI_OBJECT": 0x03,
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
            try:
                out[int(k)] = v
            except (TypeError, ValueError):
                pass
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
    return 0.0 if typ in ("f32", "f64") else 0


def raw_fields(card):
    return [f for f in card.get("fields", [])
            if f.get("type") in TYPES and "calc" not in f and "offset" in f]


def build_payload(card, card_key, seq):
    """Return payload bytes; length is dictated by PAYLOAD_SIZES."""
    spec = PAYLOAD_SIZES.get(card_key)
    if spec is None:
        # Fallback: natural extent, capped at MAX_PAYLOAD
        fields = raw_fields(card)
        if not fields:
            return bytes(0)
        natural = max(f["offset"] + TYPES[f["type"]][1] for f in fields)
        natural = min(natural, MAX_PAYLOAD)
        target_size, pad = natural, False
    else:
        target_size, pad = spec["size"], spec["pad"]

    if target_size > MAX_PAYLOAD:
        raise ValueError(f"{card_key}: declared payload size {target_size} exceeds {MAX_PAYLOAD}")

    # Build natural bytes first
    fields = raw_fields(card)
    natural_end = (max(f["offset"] + TYPES[f["type"]][1] for f in fields)
                   if fields else 0)
    buf = bytearray(natural_end)
    for f in fields:
        typ, n = f["type"], TYPES[f["type"]][1]
        value = pick(card_key, f, seq)
        if typ == "u24":
            v = int(value) & 0xFFFFFF
            raw = bytes([(v >> 16) & 0xFF, (v >> 8) & 0xFF, v & 0xFF])
        else:
            fmt = TYPES[typ][0]
            try:
                raw = struct.pack(fmt, value)
            except (struct.error, OverflowError) as exc:
                raise ValueError(f"{card_key}.{f['name']}: value {value!r} does not fit {typ}") from exc
        buf[f["offset"]:f["offset"] + n] = raw

    # Resize to target
    if len(buf) < target_size:
        pad_byte = b"\xFF" if pad else b"\x00"
        buf.extend(pad_byte * (target_size - len(buf)))
    elif len(buf) > target_size:
        # Trim if the yaml declares more fields than target allows
        buf = buf[:target_size]

    return bytes(buf)


def checksum8(data):
    return sum(data) & 0xFF


def make_frame(card, card_key, seq):
    uid, sub = int(card["unit_id"]), int(card["unit_sub_id"])
    svc, ssub = int(card["service"]), int(card["subservice"])
    sub_hdr = SUB_HDR_OVERRIDES.get(card_key, DEFAULT_SUB_HDR)
    payload = build_payload(card, card_key, seq)
    body = bytes([sub_hdr, uid, sub, svc, ssub]) + payload
    length_field = len(body)   
    w0 = (VERSION << 13) | (1 << 11) | APID
    w1 = (SEQ_FLAGS << 14) | (seq & 0x3FFF)
    inner = struct.pack(">HHH", w0, w1, length_field) + body
    return OUTER_HEADER + inner + bytes([checksum8(inner)]) + OUTER_TRAILER


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("yaml_dir", nargs="?", default="../../backend/app/tm_dictionary")
    ap.add_argument("output", nargs="?", default="tm_frames.txt")
    ap.add_argument("rounds", nargs="?", type=int, default=10)
    args = ap.parse_args()
    if args.rounds <= 0:
        ap.error("rounds must be a positive integer")

    cards = load_cards(args.yaml_dir)
    if not cards:
        ap.error(f"no telemetry cards with fields found in {args.yaml_dir}")

    out = Path(args.output)
    total = 0
    missing_size_info = []
    with out.open("w") as fh:
        for key in sorted(cards):
            card = cards[key]
            for required in ("unit_id", "unit_sub_id", "service", "subservice"):
                if required not in card:
                    raise ValueError(f"{key}: missing required card metadata {required}")
            if key not in PAYLOAD_SIZES:
                missing_size_info.append(key)
            fh.write(
                f"# ===== {key} (unit=0x{int(card['unit_id']):02X} "
                f"sub=0x{int(card['unit_sub_id']):02X} "
                f"svc=0x{int(card['service']):02X} "
                f"subsvc=0x{int(card['subservice']):02X}) =====\n"
            )
            for seq in range(args.rounds):
                fh.write(make_frame(card, key, seq).hex().upper() + "\n")
                total += 1

    print(f"Wrote {total} frames ({len(cards)} cards × {args.rounds} rounds) → {out}")
    if missing_size_info:
        print(f"⚠️  Cards without PAYLOAD_SIZES entry (using natural extent): {', '.join(missing_size_info)}")

    # ⭐ Size summary for quick verification
    print("\nPayload sizes (per card, natural first frame):")
    for key in sorted(cards):
        p = build_payload(cards[key], key, 0)
        print(f"  {key:30s} {len(p):4d} B")


if __name__ == "__main__":
    main()