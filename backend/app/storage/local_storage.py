import shutil
from pathlib import Path
from typing import BinaryIO

from app.config import settings


def save_file(subpath: str, filename: str, data: bytes) -> Path:
    """Save bytes under storage/<subpath>/<filename>. Swap for upload_to_s3() later
    with no callers needing to change."""
    directory = Path(settings.storage_root) / subpath
    directory.mkdir(parents=True, exist_ok=True)
    file_path = directory / filename
    file_path.write_bytes(data)
    return file_path


def save_stream(subpath: str, filename: str, source: BinaryIO) -> Path:
    """Stream an upload to storage/<subpath>/<filename> without holding it in RAM."""
    directory = Path(settings.storage_root) / subpath
    directory.mkdir(parents=True, exist_ok=True)
    file_path = directory / filename
    with file_path.open("wb") as target:
        shutil.copyfileobj(source, target, length=1024 * 1024)
    return file_path


def list_files(subpath: str) -> list[str]:
    directory = Path(settings.storage_root) / subpath
    if not directory.exists():
        return []
    return sorted(p.name for p in directory.iterdir() if p.is_file())


def get_file_path(subpath: str, filename: str) -> Path | None:
    safe_filename = Path(filename).name  # strip any directory components to prevent path traversal
    file_path = Path(settings.storage_root) / subpath / safe_filename
    if not file_path.is_file():
        return None
    return file_path
