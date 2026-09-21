import json
import subprocess
import threading
from pathlib import Path

# A 2-3 GB server can only afford one transcode at a time.
_ffmpeg_slot = threading.Semaphore(1)


def _stream_duration(path: Path, kind: str) -> float:
    """Duration of the first video/audio stream, falling back to a packet scan
    since MediaRecorder output usually carries no stream duration metadata."""
    probe = subprocess.run(
        [
            "ffprobe", "-v", "error",
            "-select_streams", kind,
            "-show_entries", "stream=duration",
            "-of", "json",
            str(path),
        ],
        capture_output=True,
        text=True,
    )
    try:
        data = json.loads(probe.stdout or "{}")
    except json.JSONDecodeError:
        data = {}

    for stream in data.get("streams", []):
        try:
            return float(stream["duration"])
        except (KeyError, TypeError, ValueError):
            pass

    packets = subprocess.run(
        [
            "ffprobe", "-v", "error",
            "-select_streams", kind,
            "-show_entries", "packet=pts_time",
            "-of", "csv=p=0",
            str(path),
        ],
        capture_output=True,
        text=True,
    )
    times = [float(line) for line in packets.stdout.split() if line.strip()]
    return max(times) if times else 0.0


def convert_to_mp4(source: Path, target: Path) -> None:
    """Re-encode a recording to H.264/AAC MP4. Raises on any ffmpeg failure.
    Only one conversion runs at a time."""
    with _ffmpeg_slot:
        video_len = _stream_duration(source, "v:0")
        audio_len = _stream_duration(source, "a:0")

        # The browser's canvas track can stall before the audio track ends,
        # leaving the streams different lengths. Hold the last video frame for
        # the difference so both streams span the same duration and stay in sync.
        video_filter = "fps=30"
        if audio_len > video_len > 0:
            video_filter = f"tpad=stop_mode=clone:stop_duration={audio_len - video_len:.3f},fps=30"

        subprocess.run(
            [
                "ffmpeg", "-y",
                "-fflags", "+genpts",
                "-i", str(source),
                "-filter_complex",
                f"[0:v]{video_filter}[v];[0:a]aresample=async=1:first_pts=0[a]",
                "-map", "[v]", "-map", "[a]",
                "-c:v", "libx264", "-preset", "veryfast", "-crf", "23",
                "-pix_fmt", "yuv420p",
                "-c:a", "aac", "-b:a", "128k", "-ar", "48000",
                "-movflags", "+faststart",
                str(target),
            ],
            check=True,
            capture_output=True,
            timeout=900,
        )
