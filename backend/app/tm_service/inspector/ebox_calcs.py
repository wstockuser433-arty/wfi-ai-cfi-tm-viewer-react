"""
EBOX Calculated Fields
======================

Helper functions for the `calc:` fields in ebox.yaml. Each function
takes the raw unsigned integer D from the referenced `calc_from` field
and returns the physical value.

Every formula here is transcribed verbatim from ICD v1.2 Table 49.
"""

from __future__ import annotations

import math


# ─── Linear-scaled voltages / currents ─────────────────────────────────
def V_5V_SCALE(D: int) -> float:
    """Voltage = D/4095 * 5 (ICD §Table 49, W103–W120)"""
    return D / 4095.0 * 5.0


def CURRENT_2V5_SCALE(D: int) -> float:
    """Current = 2.5 * (D/4095*5 - 2.445) (ICD W14–W21)"""
    return 2.5 * ((D / 4095.0 * 5.0) - 2.445)


def TEMP_CHIP(D: int) -> float:
    """Power conversion chip temp = 326.85 - D/4095 * 2500 (ICD W12–W13)"""
    return 326.85 - (D / 4095.0) * 2500.0


# ─── LTM8051 (sign-magnitude) ──────────────────────────────────────────
def TEMP_LTM8051(D: int) -> float:
    """
    ICD W22–W23:
      if D & 0x800 == 0:    T = D * 0.0625
      else:                 T = -(0x1000 - D) * 0.0625
    """
    if D & 0x800:
        return -(0x1000 - D) * 0.0625
    return D * 0.0625


# ─── DDR / M2S090 (u16 * 0.0625) ───────────────────────────────────────
def TEMP_DDR(D: int) -> float:
    return D * 0.0625


def TEMP_M2S090(D: int) -> float:
    return D * 0.0625


# ─── NTC thermistor (log formula from ICD W28–W55) ────────────────────
def TEMP_NTC(D: int) -> float:
    """
    R = 10 * (256*W_hi + W_lo) / (4095 - 256*W_hi - W_lo)
    Actually D is already (W_hi<<8 | W_lo), so:
        R = 10 * D / (4095 - D)
    T = 1 / ((1/298.15) + ln(R/10) / 4100) - 273.15
    """
    if D <= 0 or D >= 4095:
        return float("nan")
    R = 10.0 * D / (4095.0 - D)
    return 1.0 / ((1.0 / 298.15) + math.log(R / 10.0) / 4100.0) - 273.15


# ─── Signed 16-bit (two's complement) ─────────────────────────────────
def SIGNED_16(D: int) -> int:
    """Reinterpret u16 as i16."""
    return D - 65536 if D >= 32768 else D


def TEMP_CHANNEL_1(D: int) -> float:
    """Imaging module channel temp = SIGNED_16(D) / 128.0"""
    return SIGNED_16(D) / 128.0


def TEMP_FPGA_MODULE(D: int) -> float:
    """FPGA temp = (D/16 * 503.975/4096) - 273.15"""
    return (D / 16.0) * (503.975 / 4096.0) - 273.15

def TEMP_CHANNEL_1(D: int) -> float:
    return SIGNED_16(D) / 128.0

# ─── Named calculator dispatch table ──────────────────────────────────
# Each entry: name in YAML `calc:` → callable(D) → float/int
CALC_FUNCS: dict[str, callable] = {
    "V_5V_SCALE":           V_5V_SCALE,
    "CURRENT_2V5_SCALE":    CURRENT_2V5_SCALE,
    "TEMP_CHIP":            TEMP_CHIP,
    "TEMP_LTM8051":         TEMP_LTM8051,
    "TEMP_DDR":             TEMP_DDR,
    "TEMP_M2S090":          TEMP_M2S090,
    "TEMP_NTC":             TEMP_NTC,
    "SIGNED_16":            SIGNED_16,
    "TEMP_CHANNEL":         TEMP_CHANNEL_1,
    "TEMP_FPGA_MODULE":     TEMP_FPGA_MODULE,
}


def apply_calc(expr: str, D: int) -> float | int:
    """Look up a whitelisted function by name and apply it to D."""
    fn = CALC_FUNCS.get(expr.strip())
    if fn is None:
        raise ValueError(f"Unknown calc function: {expr!r}")
    return fn(int(D))