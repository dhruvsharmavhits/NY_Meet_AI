from datetime import datetime

from pydantic import BaseModel, Field

from app.models.meeting import MeetingStatus


class CreateMeetingRequest(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    scheduled_at: datetime | None = None


class UpdateMeetingRequest(BaseModel):
    title: str = Field(min_length=1, max_length=255)


class JoinMeetingRequest(BaseModel):
    passcode: str | None = None
    access_token: str | None = None


class MeetingResponse(BaseModel):
    id: str
    room_code: str
    title: str
    host_id: str | None
    status: MeetingStatus
    recording_status: str
    scheduled_at: datetime | None
    started_at: datetime | None
    ended_at: datetime | None
    created_at: datetime
    chime_meeting: dict | None = None
    chime_attendee: dict | None = None
    requires_passcode: bool = False
    passcode: str | None = None

    model_config = {"from_attributes": True}
