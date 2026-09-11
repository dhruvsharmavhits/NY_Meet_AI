import json
import subprocess
import uuid
from pathlib import Path


def _stream_duration(path: Path, kind: str) -> float:
    """Duration of the first video/audio stream, falling back to a packet scan
    since MediaRecorder webm usually carries no stream duration metadata."""
    probe = subprocess.run(
        [
            "ffprobe", "-v", "error",
            "-select_streams", kind,
            "-show_entries", "stream=duration",
            "-show_entries", "packet=pts_time",
            "-read_intervals", "99999%+#1",
            "-of", "json",
            str(path),
        ],
        capture_output=True,
        text=True,
    )
    try:
        data = json.loads(probe.stdout or "{}")
    except json.JSONDecodeError:
        return 0.0

    for stream in data.get("streams", []):
        try:
            return float(stream["duration"])
        except (KeyError, TypeError, ValueError):
            pass

    count = subprocess.run(
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
    times = [float(line) for line in count.stdout.split() if line.strip()]
    return max(times) if times else 0.0


def convert_webm_to_mp4(webm_path: Path) -> Path:
    mp4_path = webm_path.with_name(f"{uuid.uuid4().hex}.mp4")

    video_len = _stream_duration(webm_path, "v:0")
    audio_len = _stream_duration(webm_path, "a:0")

    # The browser's canvas video track can stall before the audio track ends,
    # leaving the two streams different lengths. Hold the last video frame for
    # the difference so the MP4's streams span the same duration and stay in
    # sync all the way through.
    video_filter = "fps=25"
    if audio_len > video_len > 0:
        video_filter = f"tpad=stop_mode=clone:stop_duration={audio_len - video_len:.3f},fps=25"

    subprocess.run(
        [
            "ffmpeg", "-y",
            "-fflags", "+genpts",
            "-i", str(webm_path),
            "-filter_complex",
            f"[0:v]{video_filter}[v];[0:a]aresample=async=1:first_pts=0[a]",
            "-map", "[v]", "-map", "[a]",
            "-c:v", "libx264", "-preset", "fast", "-crf", "23",
            "-c:a", "aac", "-b:a", "128k", "-ar", "48000",
            "-movflags", "+faststart",
            str(mp4_path),
        ],
        check=True,
        capture_output=True,
        timeout=600,
    )
    return mp4_path
