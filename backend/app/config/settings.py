from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "LinguaMeet"

    db_dialect: str = "mysql+pymysql"
    db_host: str = "127.0.0.1"
    db_port: int = 3306
    db_database: str = "nymeet"
    db_username: str = "root"
    db_password: str = ""

    storage_root: str = "../storage"

    enable_partial_transcripts: bool = False   # set False to stop live "typing" captions
    translation_provider: str = "nllb"
    google_translate_api_key: str | None = None
    nllb_model_dir: str = "models/nllb-200-distilled-600M-ct2-int8"

    cors_origins: list[str] = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "https://endorsed-depopulative-casie.ngrok-free.dev",
        "https://socket-baths-encourages-grand.trycloudflare.com",
        "https://ny-meet.sandbox-nybest.com",
    ]

    # master password required to create a new admin account (see app/admin/auth.py) —
    # not used for day-to-day admin login, which uses each admin's own user_id/password
    admin_master_password: str = "NY@2025!!"

    # AWS Chime SDK Meetings/Media Pipelines + S3 recordings. Credentials come
    # from the standard AWS env vars / instance role, never from this file.
    aws_chime_control_region: str = "us-east-1"
    aws_chime_media_region: str = "us-east-1"
    aws_recordings_bucket: str = ""
    aws_recordings_kms_key_id: str | None = None
    aws_chime_sink_iam_role_arn: str | None = None

    # Region for Amazon Transcribe Streaming (live captions)
    aws_transcribe_region: str = "us-east-1"


settings = Settings()
