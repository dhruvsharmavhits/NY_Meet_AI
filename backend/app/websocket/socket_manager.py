import asyncio
import time

import socketio
from botocore.exceptions import ClientError

from app.admin.auth import is_valid_admin_token
from app.aws import chime
from app.config import settings
from app.database import SessionLocal
from app.models import (
    ConsultationSession,
    ConsultationStatus,
    Meeting,
    MeetingDoctor,
    PatientLink,
    TranscriptEntry,
    User,
    UserSettings,
)
from app.speech.transcribe_stream import TranscribeSession
from app.translation.translator import translate

sio = socketio.AsyncServer(async_mode="asgi", cors_allowed_origins="*")


def _ts() -> str:
    t = time.time()
    return time.strftime("%H:%M:%S", time.localtime(t)) + f".{int(t % 1 * 1000):03d}"

# room_code -> {sid: {"user_id": str, "full_name": str}}
rooms: dict[str, dict[str, dict]] = {}

# room_code -> sid of the participant currently screen-sharing, or None
screen_sharers: dict[str, str | None] = {}

# sid -> continuous Amazon Transcribe Streaming session (lives for the
# whole call, not per-utterance).
transcribe_sessions: dict[str, TranscribeSession] = {}
# sid -> lock guarding lazy creation of that sid's TranscribeSession.
transcribe_session_locks: dict[str, asyncio.Lock] = {}
# sid -> last partial text emitted, so we don't spam identical partials.
last_partial_text: dict[str, str] = {}


def _get_user_by_id(user_id: str | None) -> User | None:
    if not user_id:
        return None
    db = SessionLocal()
    try:
        return db.get(User, user_id)
    finally:
        db.close()


def _stop_recording_if_active(room_code: str) -> None:
    """Mirrors the manual /recording/stop endpoint, but triggered when the
    last participant leaves an empty room instead of by a host action."""
    db = SessionLocal()
    try:
        meeting = db.query(Meeting).filter(Meeting.room_code == room_code).first()
        if meeting is None or meeting.recording_status != "recording":
            return

        if meeting.media_pipeline_id is not None:
            try:
                chime.stop_composited_capture(meeting.media_pipeline_id)
            except ClientError as exc:
                if exc.response.get("Error", {}).get("Code") != "NotFoundException":
                    print(f"[recording] auto-stop failed for meeting {meeting.id}: {exc}", flush=True)

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
    finally:
        db.close()


def _authorize_room_join(room_code: str, user_id: str, access_token: str | None, admin_token: str | None) -> bool:
    """The real access-control boundary for the doctor/patient flow: a regular
    meeting stays open to anyone (unrelated legacy behavior), but a "doctor
    room" (one with patient links) may only be entered by its host, an
    admin-authenticated browser, or a patient holding a single-use token
    issued when they were actually admitted. A REST-layer check alone isn't
    enough — this socket handshake is what actually grants WebRTC/caption
    access, so it has to be enforced here too."""
    db = SessionLocal()
    try:
        meeting = db.query(Meeting).filter(Meeting.room_code == room_code).first()
        if meeting is None:
            return False
        is_doctor_room = db.query(PatientLink).filter(PatientLink.room_id == meeting.id).first() is not None
        is_restricted = is_doctor_room or meeting.room_passcode_hash is not None
        if not is_restricted:
            return True
        if meeting.host_id == user_id:
            return True
        if is_valid_admin_token(admin_token, db):
            return True
        # a plain admin-created private room has no explicit doctor roster —
        # the passcode (already verified by the REST /join call that got this
        # browser its Chime attendee) is the only credential a provider needs.
        if meeting.room_passcode_hash is not None and meeting.third_party_app_id is None:
            return True
        if (
            db.query(MeetingDoctor)
            .filter(MeetingDoctor.meeting_id == meeting.id, MeetingDoctor.doctor_user_id == user_id)
            .first()
            is not None
        ):
            return True
        if access_token:
            active_session = (
                db.query(ConsultationSession)
                .filter(
                    ConsultationSession.room_id == meeting.id,
                    ConsultationSession.access_token == access_token,
                    ConsultationSession.status == ConsultationStatus.ACTIVE,
                    ConsultationSession.patient_user_id == user_id,
                )
                .first()
            )
            if active_session is not None:
                # single-use — consume it so it can't be replayed on another device/tab
                active_session.access_token = None
                db.commit()
                return True
        return False
    finally:
        db.close()


@sio.event
async def connect(sid, environ, auth):
    user = _get_user_by_id((auth or {}).get("user_id"))
    if user is None:
        print(f"[rtc] connect REJECTED sid={sid} auth={auth}", flush=True)
        raise ConnectionRefusedError("unauthorized")
    await sio.save_session(sid, {"user_id": user.id, "full_name": user.full_name})
    print(f"[rtc] connect sid={sid} user={user.id} ({user.full_name})", flush=True)


@sio.event
async def disconnect(sid):
    print(f"[rtc] disconnect sid={sid}", flush=True)
    session = transcribe_sessions.pop(sid, None)
    if session is not None:
        await session.close()
    transcribe_session_locks.pop(sid, None)
    last_partial_text.pop(sid, None)
    for room_code, participants in list(rooms.items()):
        if sid in participants:
            del participants[sid]
            if screen_sharers.get(room_code) == sid:
                screen_sharers[room_code] = None
                await sio.emit("screen-share-state", {"sid": sid, "sharing": False}, room=room_code)
            await sio.emit("peer-left", {"sid": sid}, room=room_code)
            if not participants:
                rooms.pop(room_code, None)
                screen_sharers.pop(room_code, None)
                await asyncio.to_thread(_stop_recording_if_active, room_code)


@sio.on("join-room")
async def join_room(sid, data):
    room_code = data["room_code"]
    session = await sio.get_session(sid)

    authorized = await asyncio.to_thread(
        _authorize_room_join, room_code, session["user_id"], data.get("access_token"), data.get("admin_token")
    )
    if not authorized:
        print(f"[rtc] join-room REJECTED sid={sid} room={room_code} user={session['user_id']}", flush=True)
        await sio.emit("join-rejected", {"reason": "unauthorized"}, room=sid)
        return

    participants = rooms.setdefault(room_code, {})

    existing = [
        {"sid": psid, "user_id": p["user_id"], "full_name": p["full_name"]}
        for psid, p in participants.items()
    ]

    participants[sid] = {"user_id": session["user_id"], "full_name": session["full_name"]}
    await sio.enter_room(sid, room_code)
    print(f"[rtc] join-room sid={sid} room={room_code} existing_peers={[p['sid'] for p in existing]}", flush=True)

    await sio.emit("existing-peers", {"peers": existing}, room=sid)
    await sio.emit(
        "peer-joined",
        {"sid": sid, "user_id": session["user_id"], "full_name": session["full_name"]},
        room=room_code,
        skip_sid=sid,
    )


@sio.on("screen-share-claim")
async def screen_share_claim(sid, data):
    room_code = data["room_code"]
    participants = rooms.get(room_code, {})
    if sid not in participants:
        return

    current_sharer = screen_sharers.get(room_code)
    if current_sharer is not None and current_sharer != sid:
        await sio.emit("force-stop-screen-share", {}, room=current_sharer)

    screen_sharers[room_code] = sid
    await sio.emit("screen-share-state", {"sid": sid, "sharing": True}, room=room_code, skip_sid=sid)


@sio.on("screen-share-stop")
async def screen_share_stop(sid, data):
    room_code = data["room_code"]
    if screen_sharers.get(room_code) == sid:
        screen_sharers[room_code] = None
        await sio.emit("screen-share-state", {"sid": sid, "sharing": False}, room=room_code, skip_sid=sid)


@sio.on("leave-room")
async def leave_room(sid, data):
    room_code = data["room_code"]
    participants = rooms.get(room_code, {})
    session = transcribe_sessions.pop(sid, None)
    if session is not None:
        await session.close()
    transcribe_session_locks.pop(sid, None)
    last_partial_text.pop(sid, None)
    if sid in participants:
        del participants[sid]
        if screen_sharers.get(room_code) == sid:
            screen_sharers[room_code] = None
            await sio.emit("screen-share-state", {"sid": sid, "sharing": False}, room=room_code)
        await sio.leave_room(sid, room_code)
        await sio.emit("peer-left", {"sid": sid}, room=room_code)
        if not participants:
            rooms.pop(room_code, None)
            screen_sharers.pop(room_code, None)
            await asyncio.to_thread(_stop_recording_if_active, room_code)


@sio.on("chat-message")
async def chat_message(sid, data):
    session = await sio.get_session(sid)
    await sio.emit(
        "chat-message",
        {
            "sid": sid,
            "full_name": session["full_name"],
            "text": data["text"],
            "ts": data.get("ts"),
        },
        room=data["room_code"],
    )


def _get_caption_languages(user_ids: list[str]) -> dict[str, str]:
    db = SessionLocal()
    try:
        rows = db.query(UserSettings).filter(UserSettings.user_id.in_(user_ids)).all()
        return {row.user_id: row.caption_language for row in rows}
    finally:
        db.close()

def _save_transcript_entry(room_code: str, user_id: str, speaker_name: str, text: str, lang: str) -> None:
    db = SessionLocal()
    try:
        meeting = db.query(Meeting).filter(Meeting.room_code == room_code).first()
        if meeting is None:
            return
        active_session = (
            db.query(ConsultationSession)
            .filter(ConsultationSession.room_id == meeting.id, ConsultationSession.status == ConsultationStatus.ACTIVE)
            .first()
        )
        db.add(
            TranscriptEntry(
                meeting_id=meeting.id,
                session_id=active_session.id if active_session else None,
                user_id=user_id,
                speaker_name=speaker_name,
                text=text,
                lang=lang,
            )
        )
        db.commit()
    finally:
        db.close()


async def _handle_transcript_result(
    sid: str, room_code: str, user_id: str, full_name: str, language: str, text: str, is_partial: bool
) -> None:
    if is_partial:
        if not settings.enable_partial_transcripts:
            return
        if text == last_partial_text.get(sid):
            return
        last_partial_text[sid] = text
        await sio.emit("partial-transcript", {"sid": sid, "text": text}, room=room_code)
        return

    pipeline_start = time.perf_counter()
    last_partial_text.pop(sid, None)

    print(f"[STT] Text: {text!r} ({_ts()})")

    asyncio.create_task(asyncio.to_thread(_save_transcript_entry, room_code, user_id, full_name, text, language))

    participants = rooms.get(room_code, {})
    user_ids = [p["user_id"] for p in participants.values()]
    caption_langs = await asyncio.to_thread(_get_caption_languages, user_ids)
    targets = dict.fromkeys(caption_langs.get(p["user_id"], "en") for p in participants.values())
    targets.pop(language, None)

    translate_start = time.perf_counter()
    results = await asyncio.gather(*(asyncio.to_thread(translate, text, language, t) for t in targets))
    translate_ms = (time.perf_counter() - translate_start) * 1000
    translations = {t: r for t, r in zip(targets, results) if r is not None}

    for t, r in translations.items():
        print(f"[Translation] {language}->{t}: {r!r} ({_ts()})")
    print(f"[Translation] Time: {translate_ms:.0f}ms")
    print(f"[Pipeline] Total: {(time.perf_counter() - pipeline_start) * 1000:.0f}ms\n")

    await sio.emit(
        "caption",
        {
            "sid": sid,
            "full_name": full_name,
            "text": text,
            "lang": language,
            "translations": translations,
            "ts": int(time.time() * 1000),
        },
        room=room_code,
    )


async def kick_patient(room_code: str, patient_user_id: str) -> None:
    participants = rooms.get(room_code, {})
    target_sids = [sid for sid, p in participants.items() if p["user_id"] == patient_user_id]
    for target_sid in target_sids:
        await sio.emit("consultation-ended", {}, room=target_sid)
        # force-disconnect rather than just removing them from the room — this is what
        # actually drops their WebRTC signaling and guarantees they can't linger in the
        # call even if the client-side event handler never runs. The existing disconnect()
        # handler above does the rooms/participants cleanup and peer-left broadcast.
        await sio.disconnect(target_sid)


async def _get_or_create_transcribe_session(sid: str, room_code: str, user_id: str, full_name: str) -> TranscribeSession:
    lock = transcribe_session_locks.setdefault(sid, asyncio.Lock())
    async with lock:
        session = transcribe_sessions.get(sid)
        if session is not None:
            return session

        async def on_result(text: str, is_partial: bool, language: str) -> None:
            asyncio.create_task(
                _handle_transcript_result(sid, room_code, user_id, full_name, language, text, is_partial)
            )

        session = TranscribeSession(on_result, sid)
        await session.start()
        transcribe_sessions[sid] = session
        return session


@sio.on("audio-chunk")
async def audio_chunk(sid, data):
    room_code = data["room_code"]
    chunk = data["chunk"]
    if not isinstance(chunk, (bytes, bytearray)):
        return

    session = transcribe_sessions.get(sid)
    if session is None:
        ctx = await sio.get_session(sid)
        try:
            session = await _get_or_create_transcribe_session(sid, room_code, ctx["user_id"], ctx["full_name"])
        except Exception as exc:
            print(f"[Transcribe] failed to start session sid={sid}: {exc!r}", flush=True)
            return

    await session.push(bytes(chunk))