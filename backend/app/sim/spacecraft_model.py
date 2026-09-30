from dataclasses import dataclass, field
import math
import random
import time


@dataclass
class SimState:
    t0: float = field(default_factory=time.time)

    # --- Camera ---
    cam_fpa_temp: float = -20.0
    cam_ccd_temp: float = -10.0
    cam_cec_temp: float = 20.0
    cam_frame_counter: int = 0

    # --- CDPM (P) ---
    fpga_die_temp: float = 45.0
    ai_soc_temp: float = 55.0
    ai_core_util: float = 40.0

    # --- CDPM (R) — warm standby ---
    fpga_die_temp_r: float = 30.0
    ai_soc_temp_r: float = 35.0

    # --- CTPU ---
    pwr_bus_42v_in_v: float = 42.0
    pwr_out_28v_bus_v: float = 28.0
    ppc_dcdc_temp: float = 50.0

    # --- Unit ---
    unit_mode: int = 1
    unit_active_cdpm: int = 0
    unit_active_ctpu: int = 0

    # --- Fault injection (dev only) ---
    inject_gyro_high: bool = False
    inject_link_degrade: bool = False

    # Counters that must stay ints
    cam_clock_locked: int = 1
    cam_lvds_locked: int = 1
    cam_cec_current: float = 1.2
    cam_cec_voltage: float = 28.0
    cam_data_rate: float = 320.0
    cam_exposure_time: float = 100.0
    cam_ccd_bias_v: float = 5.0
    fpga_core_voltage: float = 1.0
    fpga_aux_voltage: float = 1.8
    fpga_io_voltage: float = 3.3
    fpga_current: float = 2.5
    fpga_ddr_used_mb: int = 512
    fpga_frame_fifo_ovf: int = 0
    fpga_processing_latency_ms: float = 30.0
    fpga_watchdog_reset_count: int = 0
    ai_soc_power_w: float = 22.0
    ai_mem_util_pct: float = 55.0
    ai_inference_latency_ms: float = 45.0
    ai_frames_processed: int = 0
    ai_detections_count: int = 0
    ai_model_id: int = 1
    ai_health_status: int = 0
    thcc_heater_pwm_pct: float = 0.0
    thcc_heater_current: float = 0.0
    thcc_cam_plate_temp: float = -5.0
    thcc_cdpm_plate_temp: float = 20.0
    thcc_setpoint: float = -10.0
    thcc_control_loop_state: int = 1
    thcc_thermistor_ok: int = 0xFF
    pwr_bus_42v_in_i: float = 2.0
    pwr_out_42v_cam_v: float = 42.0
    pwr_out_42v_cam_i: float = 1.5
    pwr_out_28v_bus_i: float = 1.2
    pwr_uv_ov_status: int = 0
    pwr_overcurrent_fault: int = 0
    pwr_efuse_state: int = 1
    pwr_temp_pcb: float = 35.0
    ppc_primary_bus_v: float = 28.0
    ppc_primary_bus_i: float = 2.0
    ppc_secondary_bus_v: float = 5.0
    ppc_efficiency_pct: float = 88.0
    ppc_switch_freq_khz: float = 500.0
    ppc_fault_flags: int = 0
    ppc_uptime_s: int = 0

    # --- Housekeeping counters ---
    unit_uptime_s: int = 0
    unit_obc_time_corr: float = 0.0
    unit_last_tc_seq: int = 0

    # Link params (all links share)
    link_state: int = 1
    crc_err_count: int = 0
    frame_err_count: int = 0
    rx_rate_kbps: float = 1000.0
    tx_rate_kbps: float = 1000.0
    latency_us: float = 80.0

    def tick(self, dt: float = 0.1) -> None:
        t = time.time() - self.t0

        # --- Camera ---
        self.cam_fpa_temp = -20 + 2 * math.sin(0.02 * t) + random.uniform(-0.2, 0.2)
        self.cam_ccd_temp = -10 + 1.5 * math.sin(0.03 * t) + random.uniform(-0.1, 0.1)
        self.cam_cec_temp = 20 + 1.0 * math.sin(0.01 * t) + random.uniform(-0.1, 0.1)
        self.cam_frame_counter += 30

        # --- CDPM P ---
        self.fpga_die_temp = 45 + 3 * math.sin(0.04 * t) + random.uniform(-0.3, 0.3)
        self.ai_soc_temp = 55 + 2 * math.sin(0.05 * t) + random.uniform(-0.2, 0.2)
        if self.inject_gyro_high:
            self.ai_soc_temp += 0.05  # drift toward HTL
        self.ai_core_util = 40 + 15 * math.sin(0.06 * t)

        # --- CTPU ---
        self.pwr_bus_42v_in_v = 42 + 0.3 * math.sin(0.02 * t) + random.uniform(-0.05, 0.05)
        self.pwr_out_28v_bus_v = 28 + 0.2 * math.sin(0.03 * t) + random.uniform(-0.05, 0.05)
        self.ppc_dcdc_temp = 50 + 2 * math.sin(0.02 * t) + random.uniform(-0.2, 0.2)

        # --- Counters ---
        self.unit_uptime_s = int(t)
        self.ppc_uptime_s = int(t)
        self.ai_frames_processed += 30
        self.ai_detections_count += random.randint(0, 2)

        # --- Link simulation ---
        if self.inject_link_degrade:
            self.link_state = 2
            self.crc_err_count += random.randint(0, 3)
        else:
            self.link_state = 1