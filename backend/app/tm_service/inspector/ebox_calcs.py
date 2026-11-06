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


# ─── 16-bit Signed Helper ─────────────────────────────────────────────
def SIGNED_16(D: int) -> int:
    """Reinterprets a raw u16 integer as signed i16 (two's complement)."""
    return D - 65536 if D >= 32768 else D


# ─── Linear Voltages & Currents ─────────────────────────────────────────
def V_5V_SCALE(D: int) -> float:
    """
    Voltage parsing (ICD W103–W120).
    Formula: Voltage = D / 4095 * 5
    """
    return (D / 4095.0) * 5.0


def CURRENT_2V5_SCALE(D: int) -> float:
    """
    Current parsing (ICD W14–W21).
    Formula: Let V = (D / 4095) * 5, then Current = 2.5 * (V - 2.445)
    """
    v_sense = (D / 4095.0) * 5.0
    return 2.5 * (v_sense - 2.445)


# ─── Temperature Functions ─────────────────────────────────────────────
def TEMP_CHIP(D: int) -> float:
    """
    Power conversion chip temperature (ICD W12–W13).
    Formula: T = 326.85 - (D / 4095) * 2500
    """
    return 326.85 - (D / 4095.0) * 2500.0


def parse_temp_12bit(D: int) -> float:
    """
    Generic 12-bit signed temperature parser with bit-11 sign flag (0.0625 °C/LSB).
    Used for LTM8051 (W22–W23), DDR (W24–W25), and M2S090 (W26–W27).
    """
    if D & 0x800:
        return -(0x1000 - D) * 0.0625
    return D * 0.0625


def TEMP_LTM8051(D: int) -> float:
    """LTM8051 temperature (ICD W22–W23)."""
    return parse_temp_12bit(D)


def TEMP_DDR(D: int) -> float:
    """DDR memory temperature (ICD W24–W25)."""
    return parse_temp_12bit(D)


def TEMP_M2S090(D: int) -> float:
    """M2S090 temperature (ICD W26–W27)."""
    return parse_temp_12bit(D)


def TEMP_NTC(D: int) -> float:
    """
    Primary & backup thermistor channels (ICD W28–W55).
    Formula:
      R = 10 * D / (4095 - D)
      T (°C) = 1 / ((1 / 298.15) + (ln(R) / 4100)) - 273.15
    """
    if D >= 4095:
        return float("nan")  # Protect against divide-by-zero
    
    r_val = (10.0 * D) / (4095.0 - D)
    if r_val <= 0:
        return float("nan")  # Protect against log of non-positive numbers
        
    t_kelvin = 1.0 / ((1.0 / 298.15) + (math.log(r_val) / 4100.0))
    return t_kelvin - 273.15


def TEMP_CHANNEL_1(D: int) -> float:
    """
    Imaging module channel temperature (ICD W73–W74, W88–W89).
    Formula: T = SIGNED_16(D) / 128.0
    """
    return SIGNED_16(D) / 128.0


def TEMP_FPGA_MODULE(D: int) -> float:
    """
    FPGA module temperature (ICD W75–W76, W90–W91).
    Formula: T = ((D / 16) * 503.975 / 4096) - 273.15
    """
    return ((D / 16.0) * 503.975 / 4096.0) - 273.15


# ─── Calculator Dispatch Table ────────────────────────────────────────
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
    """Look up a whitelisted function by name and apply it to raw value D."""
    fn = CALC_FUNCS.get(expr.strip())
    if fn is None:
        raise ValueError(f"Unknown calc function: {expr!r}")
    return fn(int(D))