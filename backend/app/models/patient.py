import secrets
import uuid
from datetime import datetime
from enum import Enum

from sqlalchemy import DateTime, ForeignKey, String, UniqueConstraint
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


class Patient(Base):
    __tablename__ = "patients"
    __table_args__ = (UniqueConstraint("third_party_app_id", "app_patient_id"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    third_party_app_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("third_party_apps.id"), nullable=False, index=True
    )
    app_patient_id: Mapped[str] = mapped_column(String(255), nullable=False)
    patient_name: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    links: Mapped[list["PatientLink"]] = relationship(back_populates="patient")


class PatientLink(Base):
    __tablename__ = "patient_links"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    room_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("meetings.id"), nullable=True, index=True)
    patient_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("patients.id"), nullable=True, index=True)
    code: Mapped[str] = mapped_column(
        String(32), unique=True, index=True, nullable=False, default=generate_patient_code
    )
    label: Mapped[str | None] = mapped_column(String(255), nullable=True)
    status: Mapped[str] = mapped_column(String(16), default="active", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    invalidated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    room: Mapped["Meeting | None"] = relationship()
    patient: Mapped["Patient | None"] = relationship(back_populates="links")
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
