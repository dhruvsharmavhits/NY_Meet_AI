from pydantic import BaseModel

from app.models.settings import CaptionPosition


class SettingsResponse(BaseModel):
    caption_language: str
    spoken_language: str          # <-- ADD
    caption_position: CaptionPosition
    caption_font_size: int
    dark_mode: bool
    camera_device_id: str | None
    mic_device_id: str | None
    speaker_device_id: str | None

    model_config = {"from_attributes": True}


class SettingsUpdateRequest(BaseModel):
    caption_language: str | None = None
    spoken_language: str | None = None   # <-- ADD
    caption_position: CaptionPosition | None = None
    caption_font_size: int | None = None
    dark_mode: bool | None = None
    camera_device_id: str | None = None
    mic_device_id: str | None = None
    speaker_device_id: str | None = None
