import asyncio
from typing import Awaitable, Callable

from amazon_transcribe.client import TranscribeStreamingClient
from amazon_transcribe.handlers import TranscriptResultStreamHandler
from amazon_transcribe.model import TranscriptEvent

from app.config import settings

LANGUAGE_CODES = {"en": "en-US", "hi": "hi-IN", "es": "es-US"}
CODES_TO_LANGUAGE = {v: k for k, v in LANGUAGE_CODES.items()}

OnResult = Callable[[str, bool, str], Awaitable[None]]


class _ResultHandler(TranscriptResultStreamHandler):
    def __init__(self, output_stream, on_result: OnResult, sid: str):
        super().__init__(output_stream)
        self._on_result = on_result
        self._sid = sid

    async def handle_transcript_event(self, transcript_event: TranscriptEvent) -> None:
        for result in transcript_event.transcript.results:
            if not result.alternatives:
                continue
            text = result.alternatives[0].transcript
            if not text:
                continue
            language = CODES_TO_LANGUAGE.get(result.language_code or "", "en")
            print(
                f"[Transcribe] sid={self._sid} partial={result.is_partial} lang={language} text={text!r}",
                flush=True,
            )
            await self._on_result(text, bool(result.is_partial), language)


class TranscribeSession:
    """One persistent Amazon Transcribe Streaming connection per participant,
    fed continuously with raw PCM16 mono 16kHz audio for the whole call.
    Amazon Transcribe auto-detects which of LANGUAGE_CODES is being spoken
    (no fixed language per participant) and does its own endpointing,
    returning interim (partial) and stable (final) results directly."""

    def __init__(self, on_result: OnResult, sid: str = ""):
        self._on_result = on_result
        self._sid = sid
        self._stream = None
        self._handler_task: asyncio.Task | None = None

    async def start(self) -> None:
        print(
            f"[Transcribe] starting session sid={self._sid} region={settings.aws_transcribe_region}",
            flush=True,
        )
        client = TranscribeStreamingClient(region=settings.aws_transcribe_region)
        self._stream = await client.start_stream_transcription(
            language_code=None,
            media_sample_rate_hz=16000,
            media_encoding="pcm",
            # identify_language locks in one dominant language for the whole
            # session from its first guess. identify_multiple_languages
            # re-identifies per segment, so a speaker switching between
            # Hindi and English mid-call is picked up on the next utterance
            # instead of staying stuck on whatever was detected first.
            identify_multiple_languages=True,
            language_options=list(LANGUAGE_CODES.values()),
        )
        handler = _ResultHandler(self._stream.output_stream, self._on_result, self._sid)

        async def run_handler() -> None:
            try:
                await handler.handle_events()
            except Exception as exc:
                print(f"[Transcribe] result stream ended sid={self._sid}: {exc!r}", flush=True)

        self._handler_task = asyncio.create_task(run_handler())
        print(f"[Transcribe] session started sid={self._sid}", flush=True)

    async def push(self, chunk: bytes) -> None:
        if self._stream is None:
            return
        try:
            await self._stream.input_stream.send_audio_event(audio_chunk=chunk)
        except Exception as exc:
            print(f"[Transcribe] push failed sid={self._sid}: {exc!r}", flush=True)

    async def close(self) -> None:
        if self._stream is not None:
            try:
                await self._stream.input_stream.end_stream()
            except Exception:
                pass
        if self._handler_task is not None:
            self._handler_task.cancel()
