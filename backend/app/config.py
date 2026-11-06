from pydantic_settings import BaseSettings, SettingsConfigDict

from pydantic import Field
from typing import List

class Settings(BaseSettings):
    # ─── Ingestion: Ethernet ─────────────────────────────────────────
    tm_listen_host: str = "0.0.0.0"
    tm_listen_port: int = 9100          # TCP
    tm_udp_port: int = 9200             # UDP

    # ─── Ingestion: Serial (RS-422) ──────────────────────────────────
    serial_enabled: bool = False
    serial_port: str = "/tmp/ttyV1"
    serial_baud: int = 115200

    # ─── Simulator ───────────────────────────────────────────────────
    enable_sim: bool = False
    sim_rate_hz: float = 10.0

    # ─── Storage / API / decoder (likely already present) ────────────
    redis_url: str
    postgres_url: str
    cors_origins: List[str]
    api_port: int = 8000
    reload: bool = False
    debug_packet_build: bool = False
    tm_decoder: str = "ebox"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"

settings = Settings()