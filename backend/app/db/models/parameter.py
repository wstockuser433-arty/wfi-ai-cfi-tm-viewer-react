from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import BigInteger, Float, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base

if TYPE_CHECKING:
    from .packet import PacketRow


class ParameterRow(Base):
    __tablename__ = "parameters"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    packet_id: Mapped[int] = mapped_column(
        ForeignKey("packets.id", ondelete="CASCADE"),
        index=True,
    )

    name: Mapped[str] = mapped_column(String(64), index=True)
    subsystem: Mapped[str] = mapped_column(String(32), index=True)
    card: Mapped[str] = mapped_column(String(32), index=True)

    # Numeric value (floats + ints stored here for fast range queries).
    # Non-numeric values (e.g. enums stored as strings, bools stored as
    # "0"/"1") go in raw_json.
    value_num: Mapped[float | None] = mapped_column(Float, nullable=True)
    raw_json: Mapped[str | None] = mapped_column(String, nullable=True)

    unit: Mapped[str] = mapped_column(String(16), default="")
    status: Mapped[str] = mapped_column(String(8), default="OK", index=True)

    packet: Mapped["PacketRow"] = relationship(back_populates="parameters")

    def __repr__(self) -> str:
        return f"<ParameterRow {self.subsystem}.{self.card}.{self.name}={self.value_num} {self.unit}>"