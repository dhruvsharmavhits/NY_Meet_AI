from datetime import datetime, timezone

from botocore.exceptions import ClientError
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.aws import chime
from app.config import settings
from app.database import get_db
from app.models import ConsultationSession, ConsultationStatus, Meeting, MeetingParticipant, MeetingStatus, PatientLink, TranscriptEntry, User
from app.schemas.meeting import CreateMeetingRequest, MeetingResponse, UpdateMeetingRequest
from app.schemas.transcript import MeetingSummaryResponse, TranscriptEntryResponse
from app.storage.s3_storage import get_presigned_url, list_final_recordings
from app.users.dependencies import get_current_user

router = APIRouter(prefix="/meetings", tags=["meetings"])


def _get_meeting_or_404(room_code: str, db: Session) -> Meeting:
    meeting = db.query(Meeting).filter(Meeting.room_code == room_code).first()
    if meeting is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Meeting not found")
    return meeting


def ensure_chime_meeting(meeting: Meeting, db: Session) -> dict:
    """Lazily create the Chime meeting backing this room on first join, so a
    scheduled/reactivated meeting gets a fresh Chime meeting each time.
    Returns the {"Meeting": {...}} shape amazon-chime-sdk-js's
    MeetingSessionConfiguration expects verbatim."""
    if meeting.chime_meeting_id is None:
        try:
            chime_meeting = chime.create_meeting(meeting.id)
        except ClientError as exc:
            raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
        meeting.chime_meeting_id = chime_meeting["MeetingId"]
        meeting.chime_meeting_arn = chime_meeting["MeetingArn"]
        db.commit()
        db.refresh(meeting)
        return {"Meeting": chime_meeting}
    try:
        chime_meeting = chime.get_meeting(meeting.chime_meeting_id)
    except ClientError:
        # the Chime meeting expired (idle ~5h) or was otherwise reaped — create a fresh one
        try:
            chime_meeting = chime.create_meeting(meeting.id)
        except ClientError as exc:
            raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
        meeting.chime_meeting_id = chime_meeting["MeetingId"]
        meeting.chime_meeting_arn = chime_meeting["MeetingArn"]
        db.commit()
        db.refresh(meeting)
    return {"Meeting": chime_meeting}


def create_chime_attendee(meeting: Meeting, user_id: str) -> dict:
    """Returns the {"Attendee": {...}} shape amazon-chime-sdk-js's
    MeetingSessionConfiguration expects verbatim."""
    try:
        return {"Attendee": chime.create_attendee(meeting.chime_meeting_id, user_id)}
    except ClientError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc


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


def _require_host_or_admin(meeting: Meeting, current_user: User) -> None:
    if meeting.host_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the host can do this")


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

    chime_meeting = ensure_chime_meeting(meeting, db)
    chime_attendee = create_chime_attendee(meeting, current_user.id)

    meeting.chime_meeting = chime_meeting
    meeting.chime_attendee = chime_attendee
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


def _recording_subpath_ids(meeting: Meeting, db: Session) -> list[str]:
    """Recordings are saved under the active consultation session's id when one
    exists at record-start time, else the meeting's id. Check every subpath a
    recording for this meeting could have landed in."""
    session_ids = [
        row[0]
        for row in db.query(ConsultationSession.id).filter(ConsultationSession.room_id == meeting.id).all()
    ]
    return [meeting.id, *session_ids]


@router.post("/{room_code}/recording/start")
def start_recording(
    room_code: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, str]:
    meeting = _get_meeting_or_404(room_code, db)
    _require_host_or_admin(meeting, current_user)
    if meeting.chime_meeting_id is None or meeting.chime_meeting_arn is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Meeting has not started")

    active_session = (
        db.query(ConsultationSession)
        .filter(ConsultationSession.room_id == meeting.id, ConsultationSession.status == ConsultationStatus.ACTIVE)
        .first()
    )
    subpath_id = active_session.id if active_session else meeting.id
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S")
    prefix = f"meeting-recording/{subpath_id}/{timestamp}"

    try:
        pipeline = chime.start_composited_capture(meeting.chime_meeting_arn, settings.aws_recordings_bucket, prefix)
    except ClientError as exc:
        meeting.recording_status = "failed"
        db.commit()
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc

    meeting.media_pipeline_id = pipeline["MediaPipelineId"]
    meeting.media_pipeline_arn = pipeline["MediaPipelineArn"]
    meeting.recording_s3_prefix = prefix
    meeting.recording_status = "recording"
    db.commit()
    return {"status": meeting.recording_status}


@router.post("/{room_code}/recording/stop")
def stop_recording(
    room_code: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, str]:
    meeting = _get_meeting_or_404(room_code, db)
    _require_host_or_admin(meeting, current_user)

    if meeting.media_pipeline_id is not None:
        try:
            chime.stop_composited_capture(meeting.media_pipeline_id)
        except ClientError as exc:
            if exc.response.get("Error", {}).get("Code") != "NotFoundException":
                raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc

        # the capture pipeline only wrote rolling fragments — stitch them into
        # the single file admins actually download. Best-effort: a failure
        # here shouldn't block "stopped", it just means no final file appears.
        if meeting.media_pipeline_arn and meeting.recording_s3_prefix:
            try:
                chime.start_concatenation(
                    meeting.media_pipeline_arn, settings.aws_recordings_bucket, f"{meeting.recording_s3_prefix}/final"
                )
            except ClientError as exc:
                print(f"[recording] concatenation failed for meeting {meeting.id}: {exc}", flush=True)

    meeting.media_pipeline_id = None
    meeting.media_pipeline_arn = None
    meeting.recording_status = "stopped"
    db.commit()
    return {"status": meeting.recording_status}


@router.get("/{room_code}/recording-status")
def get_recording_status(
    room_code: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, str]:
    meeting = _get_meeting_or_404(room_code, db)
    return {"status": meeting.recording_status}


@router.get("/{room_code}/recordings")
def list_recordings(
    room_code: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[str]:
    meeting = _get_meeting_or_404(room_code, db)
    filenames: list[str] = []
    for subpath_id in _recording_subpath_ids(meeting, db):
        filenames.extend(list_final_recordings(f"meeting-recording/{subpath_id}"))
    return sorted(filenames)


@router.get("/{room_code}/recordings/{filename:path}")
def download_recording(
    room_code: str,
    filename: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, str]:
    meeting = _get_meeting_or_404(room_code, db)
    url = None
    for subpath_id in _recording_subpath_ids(meeting, db):
        url = get_presigned_url(f"meeting-recording/{subpath_id}", filename)
        if url is not None:
            break
    if url is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Recording not found")
    return {"url": url}
