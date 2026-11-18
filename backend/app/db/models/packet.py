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

    # ⭐ NEW HEADER COLUMNS (needed to display 0x30, 0x03, etc. in the UI)
    unit_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    unit_sub_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    service_type: Mapped[int | None] = mapped_column(Integer, nullable=True)
    service_subtype: Mapped[int | None] = mapped_column(Integer, nullable=True)
    sub_hdr_value: Mapped[int | None] = mapped_column(Integer, nullable=True)
    sub_hdr_label: Mapped[str | None] = mapped_column(String(64), nullable=True)

    # Relationship — lazy import via string avoids circular imports
    parameters: Mapped[list["ParameterRow"]] = relationship(
        back_populates="packet",
        cascade="all, delete-orphan",
        lazy="selectin",
    )

    def __repr__(self) -> str:
        return f"<PacketRow id={self.id} apid=0x{self.apid:X} ts={self.ts}>"