import boto3
from botocore.exceptions import ClientError

from app.config import settings

_s3_client = None


def _s3() -> "boto3.client":
    global _s3_client
    if _s3_client is None:
        _s3_client = boto3.client("s3")
    return _s3_client


def list_files(prefix: str) -> list[str]:
    # Chime's media capture pipeline writes objects under nested keys (not
    # flat filenames), so keep the full path relative to `prefix` — a
    # basename-only name can't be reconstructed back into the right S3 key.
    response = _s3().list_objects_v2(Bucket=settings.aws_recordings_bucket, Prefix=f"{prefix}/")
    return sorted(obj["Key"][len(prefix) + 1 :] for obj in response.get("Contents", []))


def list_subfolders(prefix: str) -> list[str]:
    """Immediate subfolder names directly under prefix/ (an S3 "directory" listing)."""
    response = _s3().list_objects_v2(
        Bucket=settings.aws_recordings_bucket, Prefix=f"{prefix}/", Delimiter="/"
    )
    return sorted(cp["Prefix"][len(prefix) + 1 : -1] for cp in response.get("CommonPrefixes", []))


def list_final_recordings(prefix: str) -> list[str]:
    """Each recording run under `prefix` lives in its own timestamped
    subfolder and only its concatenated `final/` output is a real,
    single-file recording — the raw per-run capture fragments are an
    implementation detail, not something to list as a separate "recording"."""
    filenames: list[str] = []
    for run in list_subfolders(prefix):
        for name in list_files(f"{prefix}/{run}/final"):
            filenames.append(f"{run}/final/{name}")
    return sorted(filenames)


def get_presigned_url(prefix: str, filename: str, expires_in: int = 3600) -> str | None:
    key = f"{prefix}/{filename}"
    try:
        _s3().head_object(Bucket=settings.aws_recordings_bucket, Key=key)
    except ClientError:
        return None
    return _s3().generate_presigned_url(
        "get_object",
        Params={"Bucket": settings.aws_recordings_bucket, "Key": key},
        ExpiresIn=expires_in,
    )
