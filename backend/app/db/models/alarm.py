from datetime import datetime
from sqlalchemy import BigInteger, DateTime, String, Integer
from sqlalchemy.orm import Mapped, mapped_column
from .base import Base

class AlarmRow(Base):
    __tablename__ = "alarms"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    ts: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    
    severity: Mapped[str] = mapped_column(String(8), index=True) # 'WARN' or 'CRIT'
    subsystem: Mapped[str] = mapped_column(String(32), index=True)
    card: Mapped[str] = mapped_column(String(32), index=True)
    param_name: Mapped[str] = mapped_column(String(64), index=True)
    message: Mapped[str] = mapped_column(String(512))
    
    # Optional link to the packet that caused the alarm
    packet_id: Mapped[int | None] = mapped_column(BigInteger, nullable=True)