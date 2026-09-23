from datetime import datetime

from pydantic import BaseModel, Field

from app.models.patient import ConsultationStatus


class AdminLoginRequest(BaseModel):
    user_id: str = Field(min_length=1, max_length=255)
    password: str = Field(min_length=1)


class AdminLoginResponse(BaseModel):
    token: str


class CreateAdminAccountRequest(BaseModel):
    master_password: str = Field(min_length=1)
    user_id: str = Field(min_length=1, max_length=255)
    password: str = Field(min_length=1)


class AdminAccountResponse(BaseModel):
    id: str
    user_id: str
    created_at: datetime

    model_config = {"from_attributes": True}


class CreateRoomRequest(BaseModel):
    title: str = Field(min_length=1, max_length=255)


class CreatePatientLinkRequest(BaseModel):
    label: str = Field(min_length=1, max_length=255)


class PatientLinkResponse(BaseModel):
    id: str
    room_id: str
    code: str
    label: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class ConsultationSessionResponse(BaseModel):
    id: str
    room_id: str
    patient_link_id: str
    patient_name: str
    status: ConsultationStatus
    queue_position: int | None = None
    created_at: datetime
    started_at: datetime | None
    ended_at: datetime | None

    model_config = {"from_attributes": True}


class PatientLinkWithSessionResponse(BaseModel):
    link: PatientLinkResponse
    session: ConsultationSessionResponse | None


class RoomPublicResponse(BaseModel):
    room_code: str
    title: str
    patient_name: str
    expired: bool = False


class JoinPatientLinkResponse(BaseModel):
    session: ConsultationSessionResponse
    room_code: str | None = None
    access_token: str | None = None
    chime_meeting: dict | None = None
    chime_attendee: dict | None = None
