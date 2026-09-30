from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # Ingestion
    tm_listen_host: str = "0.0.0.0"
    tm_listen_port: int = 9100
    enable_sim: bool = True
    sim_rate_hz: float = 10.0

    # Storage
    redis_url: str = "redis://localhost:6379/0"
    redis_live_stream: str = "tm.live"
    redis_live_maxlen: int = 100_000
    postgres_url: str = "postgresql+asyncpg://tm:tm@localhost:5432/tmdb"

    # API
    cors_origins: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]
    api_host: str = "0.0.0.0"
    api_port: int = 8000


settings = Settings()