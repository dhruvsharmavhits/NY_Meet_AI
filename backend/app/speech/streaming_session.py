"""
Per-participant streaming speech pipeline: continuous VAD-driven
endpointing + rolling/pre-roll buffering, sitting in front of Whisper.

Replaces the old fixed 3-second tumbling window in socket_manager.py
(which caused words to be cut mid-sentence, background noise being
transcribed during silence, and the mic effectively "restarting" every
3 seconds instead of tracking natural speech).

This module only does audio bookkeeping — it never calls Whisper
directly, so it stays cheap, synchronous, and free of any async/event-
loop concerns. The caller (websocket/socket_manager.py) decides what to
do with the SpeechEvents it returns.
"""

from __future__ import annotations

import collections
from dataclasses import dataclass

import numpy as np

from app.config import settings
from app.speech.vad import make_vad

SAMPLE_RATE = 16000
BYTES_PER_SAMPLE = 2
FRAME_BYTES = int(SAMPLE_RATE * settings.vad_frame_ms / 1000) * BYTES_PER_SAMPLE

PREROLL_FRAMES = max(1, settings.preroll_ms // settings.vad_frame_ms)
ENDPOINT_SILENCE_FRAMES = max(1, settings.endpoint_silence_ms // settings.vad_frame_ms)
PARTIAL_INTERVAL_FRAMES = max(1, settings.partial_interval_ms // settings.vad_frame_ms)
MAX_UTTERANCE_FRAMES = max(1, settings.max_utterance_ms // settings.vad_frame_ms)


@dataclass
class SpeechEvent:
    kind: str   # "partial" | "final"
    audio: bytes


class StreamingSession:
    """One instance lives per connected socket (per speaker) for the
    lifetime of the call — it is never torn down between sentences, only
    on disconnect/leave-room. That's what makes listening "continuous"
    instead of stop/restart-per-utterance."""

    def __init__(self) -> None:
        self._vad = make_vad()
        self._pending = bytearray()
        self._preroll: collections.deque[bytes] = collections.deque(maxlen=PREROLL_FRAMES)
        self._utterance = bytearray()
        self._in_speech = False
        self._silence_frames = 0
        self._frames_since_partial = 0

    def push(self, chunk: bytes) -> list[SpeechEvent]:
        """Feed newly captured raw PCM16 mono 16kHz bytes. Returns 0+
        events (partial/final) for the caller to act on."""
        events: list[SpeechEvent] = []
        self._pending.extend(chunk)
        while len(self._pending) >= FRAME_BYTES:
            frame = bytes(self._pending[:FRAME_BYTES])
            del self._pending[:FRAME_BYTES]
            events.extend(self._process_frame(frame))
        return events

    def _process_frame(self, frame_bytes: bytes) -> list[SpeechEvent]:
        events: list[SpeechEvent] = []

        # VAD sees the RAW frame — no gain/filtering applied. Server-side
        # DSP here was previously corrupting the actual transcribed audio
        # (independent per-frame AGC gain caused discontinuities that
        # confused Whisper on short words). Real AEC/NS/AGC now comes from
        # the browser's getUserMedia constraints instead (see
        # useDevicePreview.ts) — that runs before this audio even reaches
        # the backend, and doesn't have this problem.
        is_speech = self._vad.is_speech(frame_bytes, sample_rate=SAMPLE_RATE)

        if not self._in_speech:
            self._preroll.append(frame_bytes)
            if is_speech:
                self._in_speech = True
                self._silence_frames = 0
                self._frames_since_partial = 0
                self._utterance = bytearray(b"".join(self._preroll))
                self._preroll.clear()
            return events

        # Already inside an utterance — keep accumulating regardless of
        # whether THIS specific frame is speech, so a brief natural pause
        # doesn't drop audio. Only sustained silence
        # (ENDPOINT_SILENCE_FRAMES) actually ends the utterance.
        self._utterance.extend(frame_bytes)
        if is_speech:
            self._frames_since_partial += 1
        self._silence_frames = 0 if is_speech else self._silence_frames + 1

        frame_count = len(self._utterance) // FRAME_BYTES
        if (
            self._frames_since_partial >= PARTIAL_INTERVAL_FRAMES
            and frame_count < 150  # about 4.5 seconds
        ):
            self._frames_since_partial = 0
            events.append(SpeechEvent(kind="partial", audio=bytes(self._utterance)))

        frame_count = len(self._utterance) // FRAME_BYTES
        if self._silence_frames >= ENDPOINT_SILENCE_FRAMES or frame_count >= MAX_UTTERANCE_FRAMES:
            events.append(SpeechEvent(kind="final", audio=bytes(self._utterance)))
            self._in_speech = False
            self._silence_frames = 0
            self._frames_since_partial = 0
            self._utterance = bytearray()
            self._preroll.clear()

        return events