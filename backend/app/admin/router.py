import secrets
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.admin.auth import issue_token, require_admin
from app.database import get_db
from app.models import (
    ConsultationSession,
    ConsultationStatus,
    Meeting,
    MeetingStatus,
    PatientLink,
    TranscriptEntry,
    User,
)
from app.schemas.meeting import MeetingResponse
from app.schemas.patient import (
    AdminLoginRequest,
    AdminLoginResponse,
    ConsultationSessionResponse,
    CreatePatientLinkRequest,
    CreateRoomRequest,
    PatientLinkResponse,
    PatientLinkWithSessionResponse,
)
from app.schemas.transcript import TranscriptEntryResponse
from app.storage.local_storage import get_file_path, list_files
from app.users.dependencies import get_current_user
from app.websocket.socket_manager import kick_patient

router = APIRouter(prefix="/admin", tags=["admin"])


def _queue_position(db: Session, room_id: str, session: ConsultationSession) -> int | None:
    if session.status != ConsultationStatus.WAITING:
        return None
    waiting = (
        db.query(ConsultationSession)
        .filter(ConsultationSession.room_id == room_id, ConsultationSession.status == ConsultationStatus.WAITING)
        .order_by(ConsultationSession.created_at.asc())
        .all()
    )
    for idx, s in enumerate(waiting):
        if s.id == session.id:
            return idx + 1
    return None


def _session_response(db: Session, session: ConsultationSession) -> ConsultationSessionResponse:
    return ConsultationSessionResponse(
        id=session.id,
        room_id=session.room_id,
        patient_link_id=session.patient_link_id,
        patient_name=session.patient_name,
        status=session.status,
        queue_position=_queue_position(db, session.room_id, session),
        created_at=session.created_at,
        started_at=session.started_at,
        ended_at=session.ended_at,
    )


def _get_room_or_404(room_code: str, db: Session) -> Meeting:
    room = db.query(Meeting).filter(Meeting.room_code == room_code).first()
    if room is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Room not found")
    return room


def _get_session_or_404(session_id: str, db: Session) -> ConsultationSession:
    session = db.get(ConsultationSession, session_id)
    if session is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    return session


@router.post("/login", response_model=AdminLoginResponse)
def admin_login(payload: AdminLoginRequest) -> AdminLoginResponse:
    return AdminLoginResponse(token=issue_token(payload.password))


@router.post("/rooms", response_model=MeetingResponse, status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_admin)])
def create_room(
    payload: CreateRoomRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Meeting:
    room = Meeting(
        title=payload.title,
        host_id=current_user.id,
        status=MeetingStatus.ACTIVE,
        started_at=datetime.now(timezone.utc),
    )
    db.add(room)
    db.commit()
    db.refresh(room)
    return room


@router.get("/rooms", response_model=list[MeetingResponse], dependencies=[Depends(require_admin)])
def list_rooms(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[Meeting]:
    return (
        db.query(Meeting)
        .filter(Meeting.host_id == current_user.id)
        .order_by(Meeting.created_at.desc())
        .all()
    )


@router.post(
    "/rooms/{room_code}/patient-links",
    response_model=PatientLinkResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_admin)],
)
def create_patient_link(
    room_code: str,
    payload: CreatePatientLinkRequest,
    db: Session = Depends(get_db),
) -> PatientLink:
    room = _get_room_or_404(room_code, db)
    link = PatientLink(room_id=room.id, label=payload.label)
    db.add(link)
    db.commit()
    db.refresh(link)
    return link


@router.get(
    "/rooms/{room_code}/patient-links",
    response_model=list[PatientLinkWithSessionResponse],
    dependencies=[Depends(require_admin)],
)
def list_patient_links(room_code: str, db: Session = Depends(get_db)) -> list[PatientLinkWithSessionResponse]:
    room = _get_room_or_404(room_code, db)
    links = (
        db.query(PatientLink)
        .filter(PatientLink.room_id == room.id)
        .order_by(PatientLink.created_at.desc())
        .all()
    )
    result = []
    for link in links:
        session = (
            db.query(ConsultationSession)
            .filter(ConsultationSession.patient_link_id == link.id)
            .first()
        )
        result.append(
            PatientLinkWithSessionResponse(
                link=PatientLinkResponse.model_validate(link),
                session=_session_response(db, session) if session else None,
            )
        )
    return result


@router.get(
    "/rooms/{room_code}/queue",
    response_model=list[ConsultationSessionResponse],
    dependencies=[Depends(require_admin)],
)
def get_queue(room_code: str, db: Session = Depends(get_db)) -> list[ConsultationSessionResponse]:
    room = _get_room_or_404(room_code, db)
    sessions = (
        db.query(ConsultationSession)
        .filter(ConsultationSession.room_id == room.id, ConsultationSession.status != ConsultationStatus.COMPLETED)
        .order_by(ConsultationSession.created_at.asc())
        .all()
    )
    return [_session_response(db, s) for s in sessions]


@router.post(
    "/sessions/{session_id}/admit",
    response_model=ConsultationSessionResponse,
    dependencies=[Depends(require_admin)],
)
def admit_session(session_id: str, db: Session = Depends(get_db)) -> ConsultationSessionResponse:
    session = _get_session_or_404(session_id, db)
    if session.status != ConsultationStatus.WAITING:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Session is not waiting")
    other_active = (
        db.query(ConsultationSession)
        .filter(ConsultationSession.room_id == session.room_id, ConsultationSession.status == ConsultationStatus.ACTIVE)
        .first()
    )
    if other_active is not None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Another patient is already active")
    session.status = ConsultationStatus.ACTIVE
    session.started_at = datetime.now(timezone.utc)
    session.access_token = secrets.token_urlsafe(32)
    db.commit()
    db.refresh(session)
    return _session_response(db, session)


@router.post(
    "/sessions/{session_id}/complete",
    response_model=ConsultationSessionResponse,
    dependencies=[Depends(require_admin)],
)
async def complete_session(session_id: str, db: Session = Depends(get_db)) -> ConsultationSessionResponse:
    session = _get_session_or_404(session_id, db)
    room = db.get(Meeting, session.room_id)
    session.status = ConsultationStatus.COMPLETED
    session.ended_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(session)
    if room is not None and session.patient_user_id is not None:
        await kick_patient(room.room_code, session.patient_user_id)
    return _session_response(db, session)


@router.get(
    "/sessions/{session_id}/transcript",
    response_model=list[TranscriptEntryResponse],
    dependencies=[Depends(require_admin)],
)
def get_session_transcript(session_id: str, db: Session = Depends(get_db)) -> list[TranscriptEntry]:
    _get_session_or_404(session_id, db)
    return (
        db.query(TranscriptEntry)
        .filter(TranscriptEntry.session_id == session_id)
        .order_by(TranscriptEntry.created_at.asc())
        .all()
    )


@router.get(
    "/sessions/{session_id}/recordings",
    response_model=list[str],
    dependencies=[Depends(require_admin)],
)
def list_session_recordings(session_id: str, db: Session = Depends(get_db)) -> list[str]:
    _get_session_or_404(session_id, db)
    return list_files(f"meeting-recording/{session_id}")


@router.get("/sessions/{session_id}/recordings/{filename}", dependencies=[Depends(require_admin)])
def download_session_recording(session_id: str, filename: str, db: Session = Depends(get_db)) -> FileResponse:
    _get_session_or_404(session_id, db)
    file_path = get_file_path(f"meeting-recording/{session_id}", filename)
    if file_path is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Recording not found")
    return FileResponse(file_path, media_type="video/webm", filename=filename)
