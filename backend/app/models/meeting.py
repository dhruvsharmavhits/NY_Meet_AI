import secrets
import uuid
from datetime import datetime
from enum import Enum

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy import Enum as SAEnum
from sqlalchemy import func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class MeetingStatus(str, Enum):
    SCHEDULED = "scheduled"
    ACTIVE = "active"
    ENDED = "ended"


def generate_room_code() -> str:
    return "-".join(secrets.token_hex(2) for _ in range(3))


class Meeting(Base):
    __tablename__ = "meetings"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    room_code: Mapped[str] = mapped_column(
        String(32), unique=True, index=True, nullable=False, default=generate_room_code
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    host_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    status: Mapped[MeetingStatus] = mapped_column(
        SAEnum(MeetingStatus), default=MeetingStatus.SCHEDULED, nullable=False
    )
    chime_meeting_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    chime_meeting_arn: Mapped[str | None] = mapped_column(String(255), nullable=True)
    media_pipeline_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    media_pipeline_arn: Mapped[str | None] = mapped_column(String(255), nullable=True)
    recording_s3_prefix: Mapped[str | None] = mapped_column(String(255), nullable=True)
    recording_status: Mapped[str] = mapped_column(String(16), default="none", nullable=False)
    third_party_app_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("third_party_apps.id"), nullable=True, index=True
    )
    room_passcode_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    room_passcode: Mapped[str | None] = mapped_column(String(16), nullable=True)

    scheduled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    host: Mapped["User"] = relationship(back_populates="hosted_meetings")
    participants: Mapped[list["MeetingParticipant"]] = relationship(
        back_populates="meeting", cascade="all, delete-orphan"
    )

    @property
    def requires_passcode(self) -> bool:
        return self.room_passcode_hash is not None
