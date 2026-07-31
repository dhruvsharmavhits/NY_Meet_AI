import uuid
from enum import Enum

from sqlalchemy import Boolean, ForeignKey, Integer, String
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class CaptionPosition(str, Enum):
    TOP = "top"
    BOTTOM = "bottom"


class UserSettings(Base):
    __tablename__ = "user_settings"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), unique=True, nullable=False)

    caption_language: Mapped[str] = mapped_column(String(10), default="en", nullable=False)
    caption_position: Mapped[CaptionPosition] = mapped_column(
        SAEnum(CaptionPosition), default=CaptionPosition.BOTTOM, nullable=False
    )
    caption_font_size: Mapped[int] = mapped_column(Integer, default=16, nullable=False)
    dark_mode: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    camera_device_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    mic_device_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    speaker_device_id: Mapped[str | None] = mapped_column(String(255), nullable=True)

    spoken_language: Mapped[str] = mapped_column(String(10), default="en", nullable=False)   # <-- ADD THIS

    user: Mapped["User"] = relationship(back_populates="settings")