from datetime import datetime

from pydantic import BaseModel, Field


class CreateThirdPartyAppRequest(BaseModel):
    app_name: str = Field(min_length=1, max_length=255)
    company_name: str = Field(min_length=1, max_length=255)


class ThirdPartyAppResponse(BaseModel):
    id: str
    app_name: str
    company_name: str
    api_key: str | None = None
    api_key_prefix: str
    status: str
    created_at: datetime

    model_config = {"from_attributes": True}


class CreatePatientRequest(BaseModel):
    app_patient_id: str = Field(min_length=1, max_length=255)
    patient_name: str = Field(min_length=1, max_length=255)
    room_code: str | None = None


class PatientLinkInfo(BaseModel):
    code: str
    status: str
    room_code: str | None = None


class PatientResponse(BaseModel):
    id: str
    app_patient_id: str
    patient_name: str
    created_at: datetime
    links: list[PatientLinkInfo] = []


class CreateRoomRequest(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    patient_link_codes: list[str] = []
    doctor_user_ids: list[str] = []


class RoomResponse(BaseModel):
    room_code: str
    title: str
    doctor_user_ids: list[str] = []
    patient_link_codes: list[str] = []
    passcode: str | None = None


class AssignPatientLinksRequest(BaseModel):
    patient_link_codes: list[str] = Field(min_length=1)


class AssignDoctorsRequest(BaseModel):
    doctor_user_ids: list[str] = Field(min_length=1)
