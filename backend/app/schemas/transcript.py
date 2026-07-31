from datetime import datetime

from pydantic import BaseModel


class TranscriptEntryResponse(BaseModel):
    speaker_name: str
    text: str
    lang: str
    created_at: datetime

    model_config = {"from_attributes": True}


class MeetingSummaryResponse(BaseModel):
    title: str
    room_code: str
    status: str
    started_at: datetime | None
    ended_at: datetime | None
    duration_seconds: int | None
    participant_names: list[str]
    languages_spoken: list[str]
    caption_count: int
    highlights: list[str]
