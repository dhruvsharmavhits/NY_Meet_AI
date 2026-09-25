from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.meetings.router import create_chime_attendee, ensure_chime_meeting
from app.models import ConsultationSession, ConsultationStatus, Meeting, PatientLink, User
from app.schemas.patient import ConsultationSessionResponse, JoinPatientLinkResponse, RoomPublicResponse
from app.users.dependencies import get_current_user, get_current_user_optional

router = APIRouter(prefix="/patient-links", tags=["patients"])


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


def _get_link_or_404(code: str, db: Session) -> PatientLink:
    link = db.query(PatientLink).filter(PatientLink.code == code).first()
    if link is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Link not found")
    return link


def _requeue_if_reconnecting(session: ConsultationSession, db: Session) -> None:
    """A patient re-opening their link while their consultation is still
    ongoing (not completed) is treated as a reconnect request, not a silent
    resume: put them back in the WAITING queue so the doctor sees them
    reappear (by name) with a fresh Admit button, and consciously lets them
    back in rather than the patient being auto-reconnected behind the
    doctor's back."""
    if session.status == ConsultationStatus.ACTIVE:
        session.status = ConsultationStatus.WAITING
        session.access_token = None
        db.commit()
        db.refresh(session)


def _chime_join_info(session: ConsultationSession, current_user: User, db: Session) -> tuple[dict, dict]:
    room = db.get(Meeting, session.room_id)
    chime_meeting = ensure_chime_meeting(room, db)
    chime_attendee = create_chime_attendee(room, current_user.id)
    return chime_meeting, chime_attendee


@router.get("/{code}", response_model=RoomPublicResponse)
def get_patient_link(
    code: str, current_user: User | None = Depends(get_current_user_optional), db: Session = Depends(get_db)
) -> RoomPublicResponse:
    link = _get_link_or_404(code, db)
    patient_name = link.label or "Patient"
    if link.status != "active":
        return RoomPublicResponse(patient_name=patient_name, expired=True, room_assigned=link.room_id is not None)
    if link.room_id is None:
        return RoomPublicResponse(patient_name=patient_name, expired=False, room_assigned=False)
    session = db.query(ConsultationSession).filter(ConsultationSession.patient_link_id == link.id).first()
    claimed_by_other = (
        session is not None and current_user is not None and session.patient_user_id != current_user.id
    )
    expired = claimed_by_other or (session is not None and session.status == ConsultationStatus.COMPLETED)
    return RoomPublicResponse(
        room_code=link.room.room_code, title=link.room.title, patient_name=patient_name, expired=expired
    )


@router.post("/{code}/join", response_model=JoinPatientLinkResponse)
def join_patient_link(
    code: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> JoinPatientLinkResponse:
    link = _get_link_or_404(code, db)
    if link.status != "active":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This link is no longer active")
    if link.room_id is None:
        return JoinPatientLinkResponse(room_assigned=False)

    patient_name = link.label or current_user.full_name
    session = db.query(ConsultationSession).filter(ConsultationSession.patient_link_id == link.id).first()
    if session is None:
        session = ConsultationSession(
            room_id=link.room_id,
            patient_link_id=link.id,
            patient_user_id=current_user.id,
            patient_name=patient_name,
        )
        db.add(session)
    elif session.patient_user_id != current_user.id:
        # this link was already claimed by a different patient — never hand out
        # their session details (including any access token) to someone else
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This link is no longer available")
    # the link's admin-given name is the source of truth — the patient never edits it
    if current_user.full_name != patient_name:
        current_user.full_name = patient_name
    db.commit()
    db.refresh(session)
    _requeue_if_reconnecting(session, db)
    active = session.status == ConsultationStatus.ACTIVE
    chime_meeting, chime_attendee = _chime_join_info(session, current_user, db) if active else (None, None)
    return JoinPatientLinkResponse(
        session=_session_response(db, session),
        room_code=link.room.room_code if active else None,
        access_token=session.access_token if active else None,
        chime_meeting=chime_meeting,
        chime_attendee=chime_attendee,
    )


@router.get("/sessions/{session_id}", response_model=JoinPatientLinkResponse)
def get_session(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> JoinPatientLinkResponse:
    session = db.get(ConsultationSession, session_id)
    if session is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    if session.patient_user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your session")
    active = session.status == ConsultationStatus.ACTIVE
    chime_meeting, chime_attendee = _chime_join_info(session, current_user, db) if active else (None, None)
    return JoinPatientLinkResponse(
        session=_session_response(db, session),
        room_code=session.room.room_code if active else None,
        access_token=session.access_token if active else None,
        chime_meeting=chime_meeting,
        chime_attendee=chime_attendee,
    )
