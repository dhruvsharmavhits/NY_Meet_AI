from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import ConsultationSession, ConsultationStatus, Meeting, MeetingParticipant, MeetingStatus, PatientLink, TranscriptEntry, User
from app.schemas.meeting import CreateMeetingRequest, MeetingResponse, UpdateMeetingRequest
from app.schemas.transcript import MeetingSummaryResponse, TranscriptEntryResponse
from app.meetings.ice import build_ice_servers
from app.storage.local_storage import get_file_path, list_files, save_file
from app.storage.video_convert import convert_to_mp4
from app.users.dependencies import get_current_user

router = APIRouter(prefix="/meetings", tags=["meetings"])


@router.get("/ice-servers")
def get_ice_servers(current_user: User = Depends(get_current_user)) -> dict[str, list[dict]]:
    return {"iceServers": build_ice_servers(current_user.id)}


def _get_meeting_or_404(room_code: str, db: Session) -> Meeting:
    meeting = db.query(Meeting).filter(Meeting.room_code == room_code).first()
    if meeting is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Meeting not found")
    return meeting


@router.post("", response_model=MeetingResponse, status_code=status.HTTP_201_CREATED)
def create_meeting(
    payload: CreateMeetingRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Meeting:
    meeting = Meeting(
        title=payload.title,
        host_id=current_user.id,
        scheduled_at=payload.scheduled_at,
        status=MeetingStatus.SCHEDULED if payload.scheduled_at else MeetingStatus.ACTIVE,
        started_at=None if payload.scheduled_at else datetime.now(timezone.utc),
    )
    db.add(meeting)
    db.commit()
    db.refresh(meeting)
    return meeting


@router.get("", response_model=list[MeetingResponse])
def list_my_meetings(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[Meeting]:
    return (
        db.query(Meeting)
        .filter(Meeting.host_id == current_user.id)
        .order_by(Meeting.created_at.desc())
        .all()
    )


@router.get("/{room_code}", response_model=MeetingResponse)
def get_meeting(
    room_code: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Meeting:
    return _get_meeting_or_404(room_code, db)


@router.get("/{room_code}/access-info")
def get_access_info(
    room_code: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, bool]:
    meeting = _get_meeting_or_404(room_code, db)
    is_doctor_room = db.query(PatientLink).filter(PatientLink.room_id == meeting.id).first() is not None
    return {"is_doctor_room": is_doctor_room, "is_host": current_user.id == meeting.host_id}


@router.patch("/{room_code}", response_model=MeetingResponse)
def update_meeting(
    room_code: str,
    payload: UpdateMeetingRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Meeting:
    meeting = _get_meeting_or_404(room_code, db)
    if meeting.host_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the host can rename this meeting")
    meeting.title = payload.title
    db.commit()
    db.refresh(meeting)
    return meeting


@router.post("/{room_code}/join", response_model=MeetingResponse)
def join_meeting(
    room_code: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Meeting:
    meeting = _get_meeting_or_404(room_code, db)
    if meeting.status == MeetingStatus.ENDED:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Meeting has ended")

    if meeting.status == MeetingStatus.SCHEDULED:
        meeting.status = MeetingStatus.ACTIVE
        meeting.started_at = datetime.now(timezone.utc)

    db.add(MeetingParticipant(meeting_id=meeting.id, user_id=current_user.id))
    db.commit()
    db.refresh(meeting)
    return meeting


@router.post("/{room_code}/leave", status_code=status.HTTP_204_NO_CONTENT)
def leave_meeting(
    room_code: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    meeting = _get_meeting_or_404(room_code, db)

    active_participation = (
        db.query(MeetingParticipant)
        .filter(
            MeetingParticipant.meeting_id == meeting.id,
            MeetingParticipant.user_id == current_user.id,
            MeetingParticipant.left_at.is_(None),
        )
        .order_by(MeetingParticipant.joined_at.desc())
        .first()
    )
    if active_participation is not None:
        active_participation.left_at = datetime.now(timezone.utc)
        db.commit()


@router.get("/{room_code}/transcript", response_model=list[TranscriptEntryResponse])
def get_transcript(
    room_code: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[TranscriptEntry]:
    meeting = _get_meeting_or_404(room_code, db)
    return (
        db.query(TranscriptEntry)
        .filter(TranscriptEntry.meeting_id == meeting.id)
        .order_by(TranscriptEntry.created_at.asc())
        .all()
    )


@router.get("/{room_code}/summary", response_model=MeetingSummaryResponse)
def get_summary(
    room_code: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> MeetingSummaryResponse:
    meeting = _get_meeting_or_404(room_code, db)

    entries = (
        db.query(TranscriptEntry)
        .filter(TranscriptEntry.meeting_id == meeting.id)
        .order_by(TranscriptEntry.created_at.asc())
        .all()
    )
    participants = (
        db.query(MeetingParticipant).filter(MeetingParticipant.meeting_id == meeting.id).all()
    )

    participant_names = sorted(
        {db.get(User, p.user_id).full_name for p in participants if db.get(User, p.user_id)}
    )
    languages_spoken = sorted({e.lang for e in entries})

    duration_seconds = None
    if meeting.started_at is not None:
        end = meeting.ended_at or datetime.now(timezone.utc)
        started = meeting.started_at
        if started.tzinfo is None:
            started = started.replace(tzinfo=timezone.utc)
        if end.tzinfo is None:
            end = end.replace(tzinfo=timezone.utc)
        duration_seconds = int((end - started).total_seconds())

    highlight_count = min(5, len(entries))
    step = max(1, len(entries) // highlight_count) if highlight_count else 1
    highlights = [f"{e.speaker_name}: {e.text}" for e in entries[::step][:highlight_count]]

    return MeetingSummaryResponse(
        title=meeting.title,
        room_code=meeting.room_code,
        status=meeting.status.value,
        started_at=meeting.started_at,
        ended_at=meeting.ended_at,
        duration_seconds=duration_seconds,
        participant_names=participant_names,
        languages_spoken=languages_spoken,
        caption_count=len(entries),
        highlights=highlights,
    )


@router.post("/{room_code}/recordings", status_code=status.HTTP_201_CREATED)
async def upload_recording(
    room_code: str,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, str]:
    meeting = _get_meeting_or_404(room_code, db)
    active_session = (
        db.query(ConsultationSession)
        .filter(ConsultationSession.room_id == meeting.id, ConsultationSession.status == ConsultationStatus.ACTIVE)
        .first()
    )
    subpath_id = active_session.id if active_session else meeting.id
    data = await file.read()
    is_mp4 = (file.filename or "").endswith(".mp4") or file.content_type == "video/mp4"
    extension = "mp4"
    if not is_mp4:
        try:
            data = convert_to_mp4(data, ".webm")
        except Exception:
            # Never drop a recording because ffmpeg is missing or failed.
            extension = "webm"
    filename = f"{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S')}.{extension}"
    save_file(f"meeting-recording/{subpath_id}", filename, data)
    return {"filename": filename}


@router.get("/{room_code}/recordings")
def list_recordings(
    room_code: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[str]:
    meeting = _get_meeting_or_404(room_code, db)
    return list_files(f"meeting-recording/{meeting.id}")


@router.get("/{room_code}/recordings/{filename}")
def download_recording(
    room_code: str,
    filename: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> FileResponse:
    meeting = _get_meeting_or_404(room_code, db)
    file_path = get_file_path(f"meeting-recording/{meeting.id}", filename)
    if file_path is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Recording not found")
    media_type = "video/mp4" if filename.endswith(".mp4") else "video/webm"
    return FileResponse(file_path, media_type=media_type, filename=filename)
