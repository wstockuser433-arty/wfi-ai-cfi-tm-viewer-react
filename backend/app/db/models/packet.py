from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import BigInteger, Boolean, DateTime, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base

if TYPE_CHECKING:
    from .parameter import ParameterRow


class PacketRow(Base):
    __tablename__ = "packets"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    ts: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)

    apid: Mapped[int] = mapped_column(Integer, index=True)
    subsystem: Mapped[str] = mapped_column(String(32), index=True)
    card: Mapped[str] = mapped_column(String(32), index=True)
    hw_class: Mapped[str] = mapped_column(String(8), default="HW")

    seq: Mapped[int] = mapped_column(Integer)
    crc_ok: Mapped[bool] = mapped_column(Boolean, default=True)

    raw_hex: Mapped[str] = mapped_column(String)
    payload_hex: Mapped[str] = mapped_column(String)

    # Relationship — lazy import via string avoids circular imports
    parameters: Mapped[list["ParameterRow"]] = relationship(
        back_populates="packet",
        cascade="all, delete-orphan",
        lazy="selectin",
    )

    def __repr__(self) -> str:
        return f"<PacketRow id={self.id} apid=0x{self.apid:X} ts={self.ts}>"