from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class MeetingDoctor(Base):
    __tablename__ = "meeting_doctors"

    meeting_id: Mapped[str] = mapped_column(String(36), ForeignKey("meetings.id"), primary_key=True)
    doctor_user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
