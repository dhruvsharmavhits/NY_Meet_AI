import asyncio
import time

import socketio
from app.config import settings
from app.database import SessionLocal
from app.models import Meeting, TranscriptEntry, User, UserSettings
from app.speech.streaming_session import SpeechEvent, StreamingSession
from app.speech.transcriber import transcribe_final, transcribe_partial
from app.translation.translator import translate

sio = socketio.AsyncServer(async_mode="asgi", cors_allowed_origins="*")

# room_code -> {sid: {"user_id": str, "full_name": str}}
rooms: dict[str, dict[str, dict]] = {}

# sid -> continuous VAD-driven streaming session (lives for the whole
# call, not per-utterance — this is what makes listening "continuous").
streaming_sessions: dict[str, StreamingSession] = {}
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


@sio.event
async def connect(sid, environ, auth):
    user = _get_user_by_id((auth or {}).get("user_id"))
    if user is None:
        raise ConnectionRefusedError("unauthorized")
    await sio.save_session(sid, {"user_id": user.id, "full_name": user.full_name})


@sio.event
async def disconnect(sid):
    streaming_sessions.pop(sid, None)
    last_partial_text.pop(sid, None)
    for room_code, participants in list(rooms.items()):
        if sid in participants:
            del participants[sid]
            await sio.emit("peer-left", {"sid": sid}, room=room_code)
            if not participants:
                rooms.pop(room_code, None)


@sio.on("join-room")
async def join_room(sid, data):
    room_code = data["room_code"]
    session = await sio.get_session(sid)
    participants = rooms.setdefault(room_code, {})

    existing = [
        {"sid": psid, "user_id": p["user_id"], "full_name": p["full_name"]}
        for psid, p in participants.items()
    ]

    participants[sid] = {"user_id": session["user_id"], "full_name": session["full_name"]}
    await sio.enter_room(sid, room_code)

    await sio.emit("existing-peers", {"peers": existing}, room=sid)
    await sio.emit(
        "peer-joined",
        {"sid": sid, "user_id": session["user_id"], "full_name": session["full_name"]},
        room=room_code,
        skip_sid=sid,
    )


@sio.on("leave-room")
async def leave_room(sid, data):
    room_code = data["room_code"]
    participants = rooms.get(room_code, {})
    streaming_sessions.pop(sid, None)
    last_partial_text.pop(sid, None)
    if sid in participants:
        del participants[sid]
        await sio.leave_room(sid, room_code)
        await sio.emit("peer-left", {"sid": sid}, room=room_code)


@sio.on("signal")
async def signal(sid, data):
    await sio.emit(
        "signal",
        {"from": sid, "type": data["type"], "payload": data["payload"]},
        room=data["to"],
    )


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

def _get_spoken_language(user_id: str) -> str:
    db = SessionLocal()
    try:
        row = db.query(UserSettings).filter(UserSettings.user_id == user_id).first()
        return row.spoken_language if row else "en"
    finally:
        db.close()

def _save_transcript_entry(room_code: str, user_id: str, speaker_name: str, text: str, lang: str) -> None:
    db = SessionLocal()
    try:
        meeting = db.query(Meeting).filter(Meeting.room_code == room_code).first()
        if meeting is None:
            return
        db.add(
            TranscriptEntry(
                meeting_id=meeting.id,
                user_id=user_id,
                speaker_name=speaker_name,
                text=text,
                lang=lang,
            )
        )
        db.commit()
    finally:
        db.close()


async def _handle_speech_event(sid: str, room_code: str, user_id: str, full_name: str, event: SpeechEvent) -> None:
    try:
        if event.kind == "partial" and settings.enable_partial_transcripts:
            text, _ = await asyncio.to_thread(transcribe_partial, event.audio)
            if not text or text == last_partial_text.get(sid):
                return
            last_partial_text[sid] = text
            await sio.emit("partial-transcript", {"sid": sid, "text": text}, room=room_code)
            return

        # event.kind == "final"
        last_partial_text.pop(sid, None)
        print(f"[stt-debug] FINAL event sid={sid} bytes={len(event.audio)}", flush=True)
        text, detected_lang = await asyncio.to_thread(transcribe_final, event.audio)
        print(f"[stt-debug] transcribe_final -> text={text!r} lang={detected_lang!r}", flush=True)
        if not text:
            return
    except Exception:
        import traceback
        traceback.print_exc()
        return

    await asyncio.to_thread(_save_transcript_entry, room_code, user_id, full_name, text, detected_lang)

    participants = rooms.get(room_code, {})
    user_ids = [p["user_id"] for p in participants.values()]
    caption_langs = await asyncio.to_thread(_get_caption_languages, user_ids)

    translations: dict[str, str] = {}
    for p in participants.values():
        target_lang = caption_langs.get(p["user_id"], "en")
        if target_lang in translations or target_lang == detected_lang:
            continue
        translated = await asyncio.to_thread(translate, text, detected_lang, target_lang)
        if translated is not None:
            translations[target_lang] = translated

    await sio.emit(
        "caption",
        {
            "sid": sid,
            "full_name": full_name,
            "text": text,
            "lang": detected_lang,
            "translations": translations,
            "ts": int(time.time() * 1000),
        },
        room=room_code,
    )


@sio.on("audio-chunk")
async def audio_chunk(sid, data):
    room_code = data["room_code"]
    chunk = data["chunk"]
    if not isinstance(chunk, (bytes, bytearray)):
        print(f"[stt-debug] dropped non-bytes chunk sid={sid} type={type(chunk)}", flush=True)
        return

    session = streaming_sessions.setdefault(sid, StreamingSession())
    try:
        events = session.push(bytes(chunk))
    except Exception:
        import traceback
        traceback.print_exc()
        return
    if not events:
        return

    ctx = await sio.get_session(sid)
    for event in events:
        asyncio.create_task(
            _handle_speech_event(sid, room_code, ctx["user_id"], ctx["full_name"], event)
        )