from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Meeting, MeetingDoctor, MeetingStatus, Patient, PatientLink, ThirdPartyApp, User
from app.schemas.third_party import (
    AssignDoctorsRequest,
    AssignPatientLinksRequest,
    CreatePatientRequest,
    CreateRoomRequest,
    PatientLinkInfo,
    PatientResponse,
    RoomResponse,
)
from app.third_party.auth import generate_passcode, get_third_party_app

router = APIRouter(prefix="/api/v1/third-party", tags=["third-party"])


def _patient_response(patient: Patient) -> PatientResponse:
    return PatientResponse(
        id=patient.id,
        app_patient_id=patient.app_patient_id,
        patient_name=patient.patient_name,
        created_at=patient.created_at,
        links=[
            PatientLinkInfo(code=link.code, status=link.status, room_code=link.room.room_code if link.room else None)
            for link in patient.links
        ],
    )


def _get_patient_or_404(app: ThirdPartyApp, app_patient_id: str, db: Session) -> Patient:
    patient = (
        db.query(Patient)
        .filter(Patient.third_party_app_id == app.id, Patient.app_patient_id == app_patient_id)
        .first()
    )
    if patient is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found")
    return patient


def _get_room_or_404(app: ThirdPartyApp, room_code: str, db: Session) -> Meeting:
    room = (
        db.query(Meeting)
        .filter(Meeting.room_code == room_code, Meeting.third_party_app_id == app.id)
        .first()
    )
    if room is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Room not found")
    return room


def _room_response(app: ThirdPartyApp, room: Meeting, db: Session) -> RoomResponse:
    links = db.query(PatientLink).filter(PatientLink.room_id == room.id).all()
    doctors = db.query(MeetingDoctor).filter(MeetingDoctor.meeting_id == room.id).all()
    return RoomResponse(
        room_code=room.room_code,
        title=room.title,
        doctor_user_ids=[d.doctor_user_id for d in doctors],
        patient_link_codes=[link.code for link in links],
        passcode=room.room_passcode,
    )


@router.post("/patients", response_model=PatientResponse, status_code=status.HTTP_201_CREATED)
def create_patient(
    payload: CreatePatientRequest,
    app: ThirdPartyApp = Depends(get_third_party_app),
    db: Session = Depends(get_db),
) -> PatientResponse:
    room = None
    if payload.room_code:
        room = _get_room_or_404(app, payload.room_code, db)

    # a returning patient (same app_patient_id) gets a fresh link for their new
    # meeting instead of erroring — one Patient can have many consultations
    # over time, each with its own patient link.
    patient = (
        db.query(Patient)
        .filter(Patient.third_party_app_id == app.id, Patient.app_patient_id == payload.app_patient_id)
        .first()
    )
    if patient is None:
        patient = Patient(
            third_party_app_id=app.id, app_patient_id=payload.app_patient_id, patient_name=payload.patient_name
        )
        db.add(patient)
    else:
        patient.patient_name = payload.patient_name
    db.commit()
    db.refresh(patient)

    link = PatientLink(patient_id=patient.id, room_id=room.id if room else None, label=patient.patient_name)
    db.add(link)
    db.commit()
    db.refresh(patient)

    return _patient_response(patient)


@router.get("/patients/{app_patient_id}", response_model=PatientResponse)
def get_patient(
    app_patient_id: str,
    app: ThirdPartyApp = Depends(get_third_party_app),
    db: Session = Depends(get_db),
) -> PatientResponse:
    patient = _get_patient_or_404(app, app_patient_id, db)
    return _patient_response(patient)


@router.post("/patients/{patient_id}/invalidate-link")
def invalidate_link(
    patient_id: str,
    app: ThirdPartyApp = Depends(get_third_party_app),
    db: Session = Depends(get_db),
) -> dict[str, str]:
    patient = (
        db.query(Patient)
        .filter(Patient.id == patient_id, Patient.third_party_app_id == app.id)
        .first()
    )
    if patient is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found")

    link = (
        db.query(PatientLink)
        .filter(PatientLink.patient_id == patient.id, PatientLink.status == "active")
        .order_by(PatientLink.created_at.desc())
        .first()
    )
    if link is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No active link for this patient")

    link.status = "invalidated"
    link.invalidated_at = datetime.now(timezone.utc)
    db.commit()
    return {"status": "invalidated"}


@router.post("/rooms", response_model=RoomResponse, status_code=status.HTTP_201_CREATED)
def create_room(
    payload: CreateRoomRequest,
    app: ThirdPartyApp = Depends(get_third_party_app),
    db: Session = Depends(get_db),
) -> RoomResponse:
    links: list[PatientLink] = []
    for code in payload.patient_link_codes:
        link = (
            db.query(PatientLink)
            .join(Patient, PatientLink.patient_id == Patient.id)
            .filter(PatientLink.code == code, Patient.third_party_app_id == app.id, PatientLink.status == "active")
            .first()
        )
        if link is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid patient link code: {code}")
        links.append(link)

    for doctor_id in payload.doctor_user_ids:
        if db.get(User, doctor_id) is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid doctor_user_id: {doctor_id}")

    passcode, passcode_hash = generate_passcode()
    room = Meeting(
        title=payload.title,
        host_id=payload.doctor_user_ids[0] if payload.doctor_user_ids else None,
        third_party_app_id=app.id,
        room_passcode_hash=passcode_hash,
        room_passcode=passcode,
        status=MeetingStatus.ACTIVE,
        started_at=datetime.now(timezone.utc),
    )
    db.add(room)
    db.commit()
    db.refresh(room)

    for link in links:
        link.room_id = room.id
    for doctor_id in payload.doctor_user_ids:
        db.add(MeetingDoctor(meeting_id=room.id, doctor_user_id=doctor_id))
    db.commit()

    return _room_response(app, room, db)


@router.get("/rooms/{room_code}", response_model=RoomResponse)
def get_room(
    room_code: str,
    app: ThirdPartyApp = Depends(get_third_party_app),
    db: Session = Depends(get_db),
) -> RoomResponse:
    room = _get_room_or_404(app, room_code, db)
    return _room_response(app, room, db)


@router.post("/rooms/{room_code}/patients", response_model=RoomResponse)
def assign_patients(
    room_code: str,
    payload: AssignPatientLinksRequest,
    app: ThirdPartyApp = Depends(get_third_party_app),
    db: Session = Depends(get_db),
) -> RoomResponse:
    room = _get_room_or_404(app, room_code, db)
    links: list[PatientLink] = []
    for code in payload.patient_link_codes:
        link = (
            db.query(PatientLink)
            .join(Patient, PatientLink.patient_id == Patient.id)
            .filter(PatientLink.code == code, Patient.third_party_app_id == app.id, PatientLink.status == "active")
            .first()
        )
        if link is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid patient link code: {code}")
        links.append(link)

    for link in links:
        link.room_id = room.id
    db.commit()
    return _room_response(app, room, db)


@router.delete("/rooms/{room_code}/patients/{link_code}", response_model=RoomResponse)
def unassign_patient(
    room_code: str,
    link_code: str,
    app: ThirdPartyApp = Depends(get_third_party_app),
    db: Session = Depends(get_db),
) -> RoomResponse:
    room = _get_room_or_404(app, room_code, db)
    link = (
        db.query(PatientLink)
        .join(Patient, PatientLink.patient_id == Patient.id)
        .filter(PatientLink.code == link_code, Patient.third_party_app_id == app.id, PatientLink.room_id == room.id)
        .first()
    )
    if link is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patient link not found in this room")
    link.room_id = None
    db.commit()
    return _room_response(app, room, db)


@router.post("/rooms/{room_code}/doctors", response_model=RoomResponse)
def assign_doctors(
    room_code: str,
    payload: AssignDoctorsRequest,
    app: ThirdPartyApp = Depends(get_third_party_app),
    db: Session = Depends(get_db),
) -> RoomResponse:
    room = _get_room_or_404(app, room_code, db)
    for doctor_id in payload.doctor_user_ids:
        if db.get(User, doctor_id) is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid doctor_user_id: {doctor_id}")

    existing = {
        d.doctor_user_id
        for d in db.query(MeetingDoctor).filter(MeetingDoctor.meeting_id == room.id).all()
    }
    for doctor_id in payload.doctor_user_ids:
        if doctor_id not in existing:
            db.add(MeetingDoctor(meeting_id=room.id, doctor_user_id=doctor_id))
    if room.host_id is None and payload.doctor_user_ids:
        room.host_id = payload.doctor_user_ids[0]
    db.commit()
    return _room_response(app, room, db)


@router.delete("/rooms/{room_code}/doctors/{doctor_user_id}", response_model=RoomResponse)
def unassign_doctor(
    room_code: str,
    doctor_user_id: str,
    app: ThirdPartyApp = Depends(get_third_party_app),
    db: Session = Depends(get_db),
) -> RoomResponse:
    room = _get_room_or_404(app, room_code, db)
    doctor = (
        db.query(MeetingDoctor)
        .filter(MeetingDoctor.meeting_id == room.id, MeetingDoctor.doctor_user_id == doctor_user_id)
        .first()
    )
    if doctor is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Doctor not assigned to this room")
    db.delete(doctor)
    db.commit()
    return _room_response(app, room, db)
