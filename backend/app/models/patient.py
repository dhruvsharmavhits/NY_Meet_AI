import secrets
import uuid
from datetime import datetime
from enum import Enum

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy import Enum as SAEnum
from sqlalchemy import func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class ConsultationStatus(str, Enum):
    WAITING = "waiting"
    ACTIVE = "active"
    COMPLETED = "completed"


def generate_patient_code() -> str:
    return secrets.token_urlsafe(8).replace("_", "").replace("-", "")[:10]


class PatientLink(Base):
    __tablename__ = "patient_links"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    room_id: Mapped[str] = mapped_column(String(36), ForeignKey("meetings.id"), nullable=False, index=True)
    code: Mapped[str] = mapped_column(
        String(32), unique=True, index=True, nullable=False, default=generate_patient_code
    )
    label: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    room: Mapped["Meeting"] = relationship()
    session: Mapped["ConsultationSession"] = relationship(
        back_populates="patient_link", uselist=False, cascade="all, delete-orphan"
    )


class ConsultationSession(Base):
    __tablename__ = "consultation_sessions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    room_id: Mapped[str] = mapped_column(String(36), ForeignKey("meetings.id"), nullable=False, index=True)
    patient_link_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("patient_links.id"), unique=True, nullable=False
    )
    patient_user_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    patient_name: Mapped[str] = mapped_column(String(255), nullable=False, default="Patient")
    access_token: Mapped[str | None] = mapped_column(String(64), unique=True, nullable=True)
    status: Mapped[ConsultationStatus] = mapped_column(
        SAEnum(ConsultationStatus), default=ConsultationStatus.WAITING, nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    patient_link: Mapped["PatientLink"] = relationship(back_populates="session")
    room: Mapped["Meeting"] = relationship()
