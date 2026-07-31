"""
Lightweight audio preprocessing used by the streaming VAD pipeline
(app/speech/streaming_session.py) before every 30ms frame is classified
as speech/silence and before it's added to the utterance buffer that
gets sent to Whisper.

This intentionally does NOT try to be RNNoise/WebRTC-AudioProcessing —
those need a native C library dependency and a synchronized far-end
reference signal (for real acoustic echo cancellation) that this
architecture doesn't currently pipe from the browser to the backend.
Instead:
  - Acoustic echo cancellation, real noise suppression, and automatic
    gain control are requested as *browser-native* constraints on the
    mic track itself (see frontend/src/meeting/useDevicePreview.ts) —
    the same mechanism Chrome/Firefox use internally in Meet/Zoom/etc,
    and far more reliable than hand-rolled DSP on an already-downsampled,
    single-channel 16kHz stream with no reference signal.
  - What we add here, server-side, is a cheap DC/rumble blocker (kills
    constant low-frequency hum from fans/AC that browser AGC doesn't
    target) and a soft makeup-gain AGC, so a quiet talker's frames aren't
    misclassified as silence by the VAD.
"""

import numpy as np
import webrtcvad

from app.config import settings


def make_vad() -> webrtcvad.Vad:
    """One instance per session — webrtcvad.Vad keeps internal state and
    isn't documented as safe to share across concurrent streams."""
    return webrtcvad.Vad(settings.vad_aggressiveness)


class DCBlocker:
    """Stateful one-pole high-pass filter: y[n] = x[n] - x[n-1] + R*y[n-1].

    Removes DC offset and very low frequency rumble (fans, AC hum, desk
    vibration) *before* the frame reaches the VAD or the AGC gain
    calculation, so a constant hum doesn't register as sustained "energy"
    that either fools the VAD into triggering or skews the AGC's target
    gain. R=0.995 puts the cutoff around ~35Hz at 16kHz — well below
    speech fundamentals (~85Hz+), so voice itself is untouched.
    """

    def __init__(self, r: float = 0.995) -> None:
        self._r = r
        self._x_prev = 0.0
        self._y_prev = 0.0

    def process(self, frame_i16: np.ndarray) -> np.ndarray:
        x = frame_i16.astype(np.float32)
        y = np.empty_like(x)
        x_prev, y_prev = self._x_prev, self._y_prev
        r = self._r
        for i in range(x.shape[0]):
            cur = x[i]
            y[i] = cur - x_prev + r * y_prev
            x_prev, y_prev = cur, y[i]
        self._x_prev, self._y_prev = x_prev, y_prev
        return y


def apply_agc(frame_f32: np.ndarray, target_rms: float = 1800.0, max_gain: float = 6.0) -> np.ndarray:
    """Normalize a frame (int16-scale float32 samples) toward a target RMS.

    - A quiet talker gets boosted (up to max_gain) so the VAD's energy-
      sensitive classification doesn't miss real speech that's just soft.
    - Gain is clamped to [1/max_gain, max_gain], then soft-limited with
      tanh — a graceful saturation curve instead of a hard clip, so a
      loud frame doesn't get clipped into the kind of broadband
      distortion that would itself look like noise to the VAD.
    """
    rms = float(np.sqrt(np.mean(np.square(frame_f32)))) if frame_f32.size else 0.0
    if rms < 1e-6:
        return frame_f32

    gain = target_rms / rms
    gain = float(np.clip(gain, 1.0 / max_gain, max_gain))

    boosted = frame_f32 * gain
    ceiling = 32767.0
    limited = np.tanh(boosted / ceiling) * ceiling
    return limited