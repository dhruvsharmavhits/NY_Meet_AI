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


def _ts() -> str:
    t = time.time()
    return time.strftime("%H:%M:%S", time.localtime(t)) + f".{int(t % 1 * 1000):03d}"

# room_code -> {sid: {"user_id": str, "full_name": str}}
rooms: dict[str, dict[str, dict]] = {}

# sid -> continuous VAD-driven streaming session (lives for the whole
# call, not per-utterance — this is what makes listening "continuous").
streaming_sessions: dict[str, StreamingSession] = {}
# sid -> last partial text emitted, so we don't spam identical partials.
last_partial_text: dict[str, str] = {}
# sid -> lock, so overlapping speech events for the same speaker never
# transcribe concurrently.
transcription_locks: dict[str, asyncio.Lock] = {}


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
        print(f"[rtc] connect REJECTED sid={sid} auth={auth}", flush=True)
        raise ConnectionRefusedError("unauthorized")
    await sio.save_session(sid, {"user_id": user.id, "full_name": user.full_name})
    print(f"[rtc] connect sid={sid} user={user.id} ({user.full_name})", flush=True)


@sio.event
async def disconnect(sid):
    print(f"[rtc] disconnect sid={sid}", flush=True)
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

    mic_on = data.get("mic_on", True)
    camera_on = data.get("camera_on", True)

    existing = [
        {
            "sid": psid,
            "user_id": p["user_id"],
            "full_name": p["full_name"],
            "mic_on": p.get("mic_on", True),
            "camera_on": p.get("camera_on", True),
            "screen_sharing": p.get("screen_sharing", False),
        }
        for psid, p in participants.items()
    ]

    participants[sid] = {
        "user_id": session["user_id"],
        "full_name": session["full_name"],
        "mic_on": mic_on,
        "camera_on": camera_on,
        "screen_sharing": False,
    }
    await sio.enter_room(sid, room_code)
    print(f"[rtc] join-room sid={sid} room={room_code} mic_on={mic_on} camera_on={camera_on} existing_peers={[p['sid'] for p in existing]}", flush=True)

    await sio.emit("existing-peers", {"peers": existing}, room=sid)
    await sio.emit(
        "peer-joined",
        {
            "sid": sid,
            "user_id": session["user_id"],
            "full_name": session["full_name"],
            "mic_on": mic_on,
            "camera_on": camera_on,
            "screen_sharing": False,
        },
        room=room_code,
        skip_sid=sid,
    )


@sio.on("media-state")
async def media_state(sid, data):
    room_code = data["room_code"]
    participants = rooms.get(room_code, {})
    print(f"[media-debug] received from sid={sid} room={room_code} data={data} in_room={sid in participants} roster={list(participants.keys())}", flush=True)
    if sid not in participants:
        return
    participants[sid]["mic_on"] = data.get("mic_on", True)
    participants[sid]["camera_on"] = data.get("camera_on", True)
    print(f"[media-debug] broadcasting sid={sid} to room={room_code} skip_sid={sid} recipients={[s for s in participants if s != sid]}", flush=True)
    await sio.emit(
        "media-state",
        {"sid": sid, "mic_on": participants[sid]["mic_on"], "camera_on": participants[sid]["camera_on"]},
        room=room_code,
        skip_sid=sid,
    )


@sio.on("screen-share-state")
async def screen_share_state(sid, data):
    room_code = data["room_code"]
    participants = rooms.get(room_code, {})
    if sid not in participants:
        return
    participants[sid]["screen_sharing"] = data.get("sharing", False)
    await sio.emit(
        "screen-share-state",
        {"sid": sid, "sharing": participants[sid]["screen_sharing"]},
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
    print(f"[rtc] signal from={sid} to={data.get('to')} type={data.get('type')}", flush=True)
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
    if event.kind == "partial":
        if not settings.enable_partial_transcripts:
            return
        try:
            text, _ = await asyncio.to_thread(transcribe_partial, event.audio)
        except Exception:
            return
        if not text or text == last_partial_text.get(sid):
            return
        last_partial_text[sid] = text
        await sio.emit("partial-transcript", {"sid": sid, "text": text}, room=room_code)
        return

    pipeline_start = time.perf_counter()

    participants = rooms.get(room_code, {})
    user_ids = [p["user_id"] for p in participants.values()]
    caption_langs_task = asyncio.create_task(asyncio.to_thread(_get_caption_languages, user_ids))

    lock = transcription_locks.setdefault(sid, asyncio.Lock())
    async with lock:
        last_partial_text.pop(sid, None)
        stt_start = time.perf_counter()
        try:
            text, detected_lang = await asyncio.to_thread(transcribe_final, event.audio)
        except Exception:
            text = ""
        stt_ms = (time.perf_counter() - stt_start) * 1000
        if not text:
            caption_langs_task.cancel()
            return

    print(f"[STT] Text: {text!r} ({_ts()})")
    print(f"[STT] Time: {stt_ms:.0f}ms")

    asyncio.create_task(asyncio.to_thread(_save_transcript_entry, room_code, user_id, full_name, text, detected_lang))

    caption_langs = await caption_langs_task
    targets = dict.fromkeys(caption_langs.get(p["user_id"], "en") for p in participants.values())
    targets.pop(detected_lang, None)

    translate_start = time.perf_counter()
    results = await asyncio.gather(*(asyncio.to_thread(translate, text, detected_lang, t) for t in targets))
    translate_ms = (time.perf_counter() - translate_start) * 1000
    translations = {t: r for t, r in zip(targets, results) if r is not None}

    for t, r in translations.items():
        print(f"[Translation] {detected_lang}->{t}: {r!r} ({_ts()})")
    print(f"[Translation] Time: {translate_ms:.0f}ms")
    print(f"[Pipeline] Total: {(time.perf_counter() - pipeline_start) * 1000:.0f}ms\n")

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
        return

    session = streaming_sessions.setdefault(sid, StreamingSession())
    try:
        events = session.push(bytes(chunk))
    except Exception:
        return
    if not events:
        return

    ctx = await sio.get_session(sid)
    for event in events:
        asyncio.create_task(
            _handle_speech_event(sid, room_code, ctx["user_id"], ctx["full_name"], event)
        )