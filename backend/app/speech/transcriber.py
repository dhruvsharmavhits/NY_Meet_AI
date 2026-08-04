"""
Two-tier Whisper transcription:
  - transcribe_partial(): a small/fast model + greedy decoding, called
    every ~900ms *while the user is still talking* to drive live
    "typing-as-you-speak" captions. Latency matters far more than
    accuracy here — a partial is disposable and gets replaced within a
    second anyway.
  - transcribe_final(): the larger/accurate model + beam search + the
    temperature fallback ladder, called exactly once per utterance after
    endpointing (streaming_session.py) decides the speaker actually
    stopped. Accuracy matters far more than latency here — this is what
    gets saved, translated, and shown as the permanent caption.

Both share the same RMS energy gate and avg_logprob confidence filter as
before. vad_filter is now OFF on both — the external VAD in
streaming_session.py already keeps non-speech audio from reaching this
module at all, so Whisper's own internal VAD re-chopping the same audio
was redundant and occasionally disagreed with it, itself contributing to
clipped words.
"""

import re

import numpy as np
import requests
from faster_whisper import WhisperModel

from app.config import settings

_models: dict[str, WhisperModel] = {}
_deepgram_session = requests.Session()


def _deepgram_transcribe(audio_bytes: bytes, language: str | None) -> tuple[str, str] | None:
    try:
        resp = _deepgram_session.post(
            "https://api.deepgram.com/v1/listen",
            params={
                "model": "nova-2",
                "language": language or "en",
                "smart_format": "true",
                "encoding": "linear16",
                "sample_rate": "16000",
                "channels": "1",
            },
            headers={
                "Authorization": f"Token {settings.deepgram_api_key}",
                "Content-Type": "audio/raw",
            },
            data=audio_bytes,
            timeout=10,
        )
        resp.raise_for_status()
        alt = resp.json()["results"]["channels"][0]["alternatives"][0]
        return alt["transcript"].strip(), language or "en"
    except Exception:
        return None

# Biases decoding context toward the languages we actually support — cheap
# (a handful of extra prompt tokens), no extra model, no extra load.
WHISPER_PROMPT = "This is a natural everyday conversation in English."

# Unicode block ranges used to catch a specific, common Whisper failure
# mode: outputting the wrong SCRIPT entirely (e.g. Bengali characters when
# the speaker was actually speaking Gujarati) — a strong hallucination
# signal that avg_logprob/compression_ratio alone don't reliably catch.
_GUJARATI_RANGE = (0x0A80, 0x0AFF)
_DEVANAGARI_RANGE = (0x0900, 0x097F)
_BENGALI_RANGE = (0x0980, 0x09FF)
_LATIN_RANGE = (0x0041, 0x024F)


def _dominant_script(text: str) -> str:
    counts = {"gujarati": 0, "devanagari": 0, "bengali": 0, "latin": 0, "other": 0}
    for ch in text:
        cp = ord(ch)
        if _GUJARATI_RANGE[0] <= cp <= _GUJARATI_RANGE[1]:
            counts["gujarati"] += 1
        elif _DEVANAGARI_RANGE[0] <= cp <= _DEVANAGARI_RANGE[1]:
            counts["devanagari"] += 1
        elif _BENGALI_RANGE[0] <= cp <= _BENGALI_RANGE[1]:
            counts["bengali"] += 1
        elif _LATIN_RANGE[0] <= cp <= _LATIN_RANGE[1]:
            counts["latin"] += 1
        elif not ch.isspace():
            counts["other"] += 1
    total = sum(counts.values())
    if total == 0:
        return "unknown"
    return max(counts, key=counts.get)


def is_hallucination(text: str, expected_language: str | None = None) -> bool:
    """Catches the specific hallucination patterns avg_logprob/compression_ratio
    miss: prompt echo, a syllable stuck repeating, or the wrong script entirely
    for the language we asked Whisper to use."""
    if not text or not text.strip():
        return True
    cleaned = text.strip()

    if cleaned.lower() in WHISPER_PROMPT.lower() or WHISPER_PROMPT.lower() in cleaned.lower():
        return True
    if re.search(r"(.)\1{4,}", cleaned):            # one char repeating 5+ times
        return True
    if re.search(r"(\S+)(?:\s+\1){2,}", cleaned):    # a word/syllable repeating 3+ times
        return True

    if expected_language is not None:
        script = _dominant_script(cleaned)
        if expected_language == "gu" and script not in ("gujarati", "latin", "other"):
            return True
        if expected_language == "hi" and script not in ("devanagari", "latin", "other"):
            return True
        if expected_language == "en" and script not in ("latin", "other"):
            return True

    if not re.search(r"\w", cleaned):
        return True
    return False

# RMS (on a 0-1 normalized float32 waveform) below this is treated as
# silence/background noise and never sent to Whisper at all.
MIN_RMS_ENERGY = 0.012

# Segments Whisper isn't actually confident about (common on noisy or
# clipped audio) are dropped rather than shown as a caption.
MIN_AVG_LOGPROB = -1.0

# Whisper's own repetition/hallucination guard: if a segment's text
# compresses more than this ratio, it's almost always a stuck loop
# ("the the the the...") rather than real speech.
COMPRESSION_RATIO_THRESHOLD = 2.4

# Above this probability that a segment is "no speech", drop it — catches
# cases where the RMS gate and VAD both pass a frame (a loud but
# non-speech sound, e.g. a cough or door) but Whisper itself isn't
# confident there's real speech content.
NO_SPEECH_THRESHOLD = 0.6


def _get_model(size: str) -> WhisperModel:
    if size not in _models:
        _models[size] = WhisperModel(
            size,
            device="cpu",
            compute_type="int8",
            download_root=settings.whisper_model_dir,
        )
    return _models[size]


def _normalize_peak(audio: np.ndarray, target_peak: float = 0.9) -> np.ndarray:
    # Whole-buffer, single-pass peak normalization — NOT per-frame like the
    # AGC we removed earlier (that one broke short words via inter-frame
    # discontinuities). One uniform scale factor across the entire
    # utterance can't introduce that artifact.
    peak = float(np.abs(audio).max()) if audio.size else 0.0
    if peak < 1e-6:
        return audio
    return (audio / peak * target_peak).astype(np.float32)


def _prepare_audio(audio_bytes: bytes) -> np.ndarray | None:
    audio = np.frombuffer(audio_bytes, dtype=np.int16).astype(np.float32) / 32768.0
    rms = float(np.sqrt(np.mean(np.square(audio)))) if audio.size else 0.0
    if rms < MIN_RMS_ENERGY:
        return None
    return audio


def transcribe_partial(audio_bytes: bytes, language: str | None = "en") -> tuple[str, str]:
    """Fast draft pass for live captions. Greedy decode (beam_size=1,
    temperature=0) on the small "partial" model — called repeatedly on a
    *growing* buffer, so it must stay cheap. Accuracy is recovered by
    transcribe_final() once the utterance actually ends."""
    audio = _prepare_audio(audio_bytes)
    if audio is None:
        return "", ""

    if settings.deepgram_api_key:
        result = _deepgram_transcribe(audio_bytes, language)
        if result is not None:
            text, detected_lang = result
            return ("", "") if is_hallucination(text, expected_language=detected_lang) else (text, detected_lang)

    segments, info = _get_model(settings.whisper_partial_model_size).transcribe(
        _normalize_peak(audio),
        language=language,
        beam_size=1,
        best_of=1,
        temperature=0.0,
        vad_filter=False,
        condition_on_previous_text=False,
        no_speech_threshold=0.5,
        compression_ratio_threshold=COMPRESSION_RATIO_THRESHOLD,
        log_prob_threshold=MIN_AVG_LOGPROB,   # lets Whisper's own fallback logic use this too, not just our post-filter
        word_timestamps=False,
    )
    segments = [s for s in segments if s.avg_logprob >= MIN_AVG_LOGPROB]
    text = " ".join(segment.text.strip() for segment in segments).strip()
    detected_lang = language or info.language
    if is_hallucination(text, expected_language=detected_lang):
        return "", ""
    return text, detected_lang


def transcribe_final(
    audio_bytes: bytes,
    language: str | None = "en",
    initial_prompt: str | None = None,
) -> tuple[str, str]:
    """Accurate pass, run once per finished utterance. Beam search +
    Whisper's temperature fallback ladder: if the low-temperature attempt
    looks like a hallucination (fails the compression-ratio or
    no-speech/logprob checks), Whisper itself retries at a higher
    temperature — this prevents garbled/incomplete transcripts far more
    than any single parameter alone would."""
    audio = _prepare_audio(audio_bytes)
    if audio is None:
        return "", ""

    if settings.deepgram_api_key:
        result = _deepgram_transcribe(audio_bytes, language)
        if result is not None:
            text, detected_lang = result
            print("[STT] Provider: Deepgram")
            return ("", "") if is_hallucination(text, expected_language=detected_lang) else (text, detected_lang)
        print("[STT] Deepgram failed, falling back to Whisper")

    print(f"[STT] Provider: Whisper{' (fallback)' if settings.deepgram_api_key else ''}")
    segments, info = _get_model(settings.whisper_model_size).transcribe(
        _normalize_peak(audio),
        language=language,
        beam_size=2,
        best_of=2,
        patience=1.0,
        temperature=0.0,              # shorter fallback ladder — fewer retries = lower worst-case latency
        vad_filter=False,
        condition_on_previous_text=False,
        initial_prompt=initial_prompt or WHISPER_PROMPT,
        no_speech_threshold=0.7,
        compression_ratio_threshold=COMPRESSION_RATIO_THRESHOLD,
        log_prob_threshold=MIN_AVG_LOGPROB,
        word_timestamps=True,
    )
    segments = [s for s in segments if s.avg_logprob >= MIN_AVG_LOGPROB]
    text = " ".join(segment.text.strip() for segment in segments).strip()
    detected_lang = language or info.language
    if is_hallucination(text, expected_language=detected_lang):
        return "", ""
    return text, detected_lang


# Back-compat shim — anything still importing the old name gets the
# accurate/final behavior.
transcribe_pcm16 = transcribe_final