#!/usr/bin/env python3
"""
Generate tm_frames.txt: N full RS422-wrapped TM frames per card, one frame
per line, ready for replay_tm_frames.py to feed to the serial sender.
"""
import math, random, struct, sys, zlib, re
from pathlib import Path

TYPES = {
    "u8": (">B", 1), "u16": (">H", 2), "u24": (None, 3), "u32": (">I", 4), "u64": (">Q", 8),
    "i8": (">b", 1), "i16": (">h", 2), "i32": (">i", 4), "i64": (">q", 8),
    "f32": (">f", 4), "f64": (">d", 8),
}
MAX_PAYLOAD = 238
SEQ_FLAGS   = 0x03
APID        = 0x2B
VERSION     = 0x02
OUTER_HEADER  = bytes.fromhex("23232A2A")
OUTER_TRAILER = bytes.fromhex("2A2A2323")
SUB_HDR       = 0x01   # fast TM

# ─── tiny yaml reader (same subset as your sender) ────────────────────
CARD_RE     = re.compile(r"^  ([A-Za-z0-9_]+):\s*(#.*)?$")
ATTR_RE     = re.compile(r"^    (unit_sub_id|service|subservice|unit_id):\s*(\S+)")
INLINE_RE   = re.compile(r"^\s+-\s*\{(.*)\}\s*(#.*)?$")
BLOCK_START = re.compile(r"^\s+-\s+name:\s*(\S+)")
BLOCK_ATTR  = re.compile(r"^\s+(\w+):\s*(.*?)\s*(#.*)?$")

def scalar(s):
    s = s.strip()
    if s.startswith('"'): return s.strip('"')
    try: return int(s, 0)
    except ValueError:
        try: return float(s)
        except ValueError: return s

def parse_yaml(path):
    cards, cur, cur_field, in_cards = {}, None, None, False
    def flush():
        nonlocal cur_field
        if cur_field and cur is not None: cur["fields"].append(cur_field)
        cur_field = None
    for raw in open(path).read().splitlines():
        if raw.startswith("cards:"): in_cards = True; continue
        if not in_cards or not raw.strip() or raw.lstrip().startswith("#"): continue
        m = CARD_RE.match(raw)
        if m: flush(); cur = cards[m.group(1)] = {"fields": []}; continue
        m = ATTR_RE.match(raw)
        if m and cur is not None and cur_field is None:
            cur[m.group(1)] = scalar(m.group(2)); continue
        m = INLINE_RE.match(raw)
        if m and cur is not None:
            flush(); body = m.group(1); f = {}
                        # extract enum if present — try inline, then block, then quoted
            em = re.search(r"enum:\s*\{([^}]*)\}", body)
            if em:
                try:
                    f["enum"] = {int(k): v for k, v in
                                 re.findall(r'(\d+)\s*:\s*"?([A-Za-z0-9_\- ]+)"?',
                                            em.group(1))}
                except Exception:
                    pass
                body = body[:em.start()] + body[em.end():]
            for k, v in re.findall(r'(\w+)\s*:\s*("[^"]*"|[^,]+)', body):
                f[k] = scalar(v)
            if all(k in f for k in ("name","offset","type")):
                cur["fields"].append(f)
        m = BLOCK_START.match(raw)
        if m and cur is not None: flush(); cur_field = {"name": m.group(1)}; continue
        m = BLOCK_ATTR.match(raw)
        if m and cur_field is not None: cur_field[m.group(1)] = scalar(m.group(2))
    flush()
    return cards

# ─── value generator ──────────────────────────────────────────────────
ENUM_DEFAULTS = {
    "cam_clock_locked": 1, "cam_lvds_locked": 1, "ai_health_status": 0,
    "thcc_control_loop_state": 1, "pwr_overcurrent_fault": 0, "pwr_efuse_state": 1,
    "unit_mode": 2, "o2_board_mode": 1, "o2_training_status": 0,
    "startup_status": 0, "image_slot_state": 0,
    "ota_checksum_ok": 1, "ota_rebuild_ok": 1,
    "can_bus_a_state": 1, "can_bus_b_state": 1,
    "o2_prev_model_type": 0, "o2_curr_model_type": 0,
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
    # CDPM_AI health counters — realistic climbing values
    "o2_fpga_rx_count":          (1000, 2000),
    "o2_health_req_rx_count":    (10, 50),
    "o2_health_rep_tx_count":    (10, 50),
    "o2_obj_req_rx_count":       (10, 50),
    "o2_obj_rep_tx_count":       (10, 50),
    "o2_total_tc_rx":            (100, 500),
    "o2_total_tm_tx":            (100, 500),
    "o2_num_models":             (1, 3),
    "o2_cpu_temp_int":           (30, 60),
    "o2_cpu_util_int":           (10, 80),
    "o2_nvme_used":              (10, 50),
    "o2_num_images_onboard":     (100, 2000),
    "o2_unsuccessful_cmd_count": (0, 5),
    "o2_last_upl_ok_frames":     (0, 500),
    "o2_last_upl_bad_frames":    (0, 5),
}

def pick(card_key, f, seq):
    name, typ = f["name"], f["type"]

    # ── enum handling (defensive against unparsed string form) ─────
    enum = f.get("enum")
    if isinstance(enum, dict) and enum:
        v = ENUM_DEFAULTS.get(name)
        if v is not None and v in enum:
            return v
        return min(enum.keys())
    elif isinstance(enum, str):
        # e.g. enum landed here as a raw string — try to parse it now
        m = re.search(r"\{([^}]*)\}", enum)
        if m:
            try:
                pairs = {int(k): val for k, val in
                         re.findall(r'(\d+)\s*:\s*"?([A-Za-z0-9_\- ]+)"?', m.group(1))}
                if pairs:
                    v = ENUM_DEFAULTS.get(name)
                    if v is not None and v in pairs:
                        return v
                    return min(pairs.keys())
            except Exception:
                pass
        # couldn't parse — fall through to numeric default

    if name in FIXED:
        return FIXED[name]
    if name in RANGES:
        lo, hi = RANGES[name]
        mid, half = (lo + hi) / 2, (hi - lo) / 2
        h = zlib.crc32(f"{card_key}:{name}".encode())
        return int(round(mid + half * math.sin(seq / 20.0 + (h % 360) * math.pi / 180)))
    if name.startswith("terrain_elevation_"):
        h = zlib.crc32(name.encode())
        return 250 + int(240 * math.sin(seq / 20.0 + (h % 360) * math.pi / 180))
    if name.startswith(("acb_", "acs_")):
        h = zlib.crc32(name.encode())
        return 2.0 * math.sin(seq / 30.0 + (h % 360) * math.pi / 180)
    if f.get("unit") == "cnt":
        return seq % 255
    return 0.0 if typ in ("f32", "f64") else 0

def build_payload(card, card_key, seq):
    physical = [f for f in card["fields"] if f["type"] in TYPES and "calc" not in f]
    if not physical:
        return b"\x00" * MAX_PAYLOAD
    size = max(f["offset"] + TYPES[f["type"]][1] for f in physical)
    buf = bytearray(size)
    for f in physical:
        typ = f["type"]
        fmt, n = TYPES[typ]
        v = pick(card_key, f, seq)
        if typ == "u24":
            iv = int(v) & 0xFFFFFF
            raw = bytes([(iv >> 16) & 0xFF, (iv >> 8) & 0xFF, iv & 0xFF])
        else:
            raw = struct.pack(fmt, v)
        buf[f["offset"]:f["offset"] + n] = raw
    return bytes(buf).ljust(MAX_PAYLOAD, b"\x00")

def checksum8(b): return sum(b) & 0xFF

def make_frame(card, card_key, seq):
    uid   = int(card["unit_id"])
    sub   = int(card["unit_sub_id"])
    svc   = int(card["service"])
    ssub  = int(card["subservice"])
    body  = bytes([SUB_HDR, uid, sub, svc, ssub]) + build_payload(card, card_key, seq)
    length_field = len(body) + 1 - 1
    w0 = (VERSION << 13) | (1 << 11) | APID
    w1 = (SEQ_FLAGS << 14) | (seq & 0x3FFF)
    inner = struct.pack(">HHH", w0, w1, length_field) + body
    return OUTER_HEADER + inner + bytes([checksum8(inner)]) + OUTER_TRAILER

def main():
    yaml_dir = Path(sys.argv[1] if len(sys.argv) > 1 else "../../backend/app/tm_dictionary")
    out      = Path(sys.argv[2] if len(sys.argv) > 2 else "tm_frames.txt")
    rounds   = int(sys.argv[3]) if len(sys.argv) > 3 else 10

    cards = {}
    for p in sorted(yaml_dir.glob("*.yaml")):
        for k, c in parse_yaml(p).items():
            if c.get("fields"): cards[k] = c

    with open(out, "w") as fh:
        n = 0
        for key in sorted(cards):
            fh.write(f"# ===== {key}  (unit=0x{int(cards[key]['unit_id']):02X} "
                     f"sub=0x{int(cards[key]['unit_sub_id']):02X} "
                     f"svc=0x{int(cards[key]['service']):02X} "
                     f"subsvc=0x{int(cards[key]['subservice']):02X}) =====\n")
            for seq in range(rounds):
                fh.write(make_frame(cards[key], key, seq).hex().upper() + "\n")
                n += 1
    print(f"Wrote {n} frames ({len(cards)} cards × {rounds} rounds) → {out}")

if __name__ == "__main__":
    main()