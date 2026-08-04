from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "LinguaMeet"
    database_url: str = "sqlite:///./linguameet.db"

    storage_root: str = "../storage"

    stt_provider: str = "faster_whisper"
    deepgram_api_key: str | None = None
    whisper_model_size: str = "small"              # accurate/final pass — was "base"; "small" is noticeably better on Hindi/Gujarati
    whisper_partial_model_size: str = "tiny"        # fast/draft pass for live captions while the user is still talking
    whisper_model_dir: str = "models/whisper"
    enable_partial_transcripts: bool = False   # set False to stop live "typing" captions and cut CPU load significantly
    # --- streaming VAD / endpointing tuning ---
    vad_aggressiveness: int = 2       # webrtcvad 0-3: 0=most permissive, 3=most aggressive. 2 balances
                                       # rejecting fan/AC/keyboard noise against not clipping soft speech onsets.
    vad_frame_ms: int = 30            # webrtcvad ONLY accepts 10/20/30ms frames — 30ms gives more context per
                                       # decision than 10/20ms, which reduces speech/silence flicker.
    preroll_ms: int = 300             # audio always kept buffered before speech onset, so the first word/
                                       # consonant (which often ramps up before VAD triggers) isn't clipped.
    endpoint_silence_ms: int = 600    # continuous silence required before an utterance is finalized — tolerates
                                       # natural mid-sentence pauses (300-500ms) without cutting the user off.
    partial_interval_ms: int = 1500    # how often a live "typing-as-you-speak" partial is regenerated.
    max_utterance_ms: int = 30000     # hard safety cap so one long monologue can't grow the buffer forever.
    translation_provider: str = "nllb"
    google_translate_api_key: str | None = None
    nllb_model_dir: str = "models/nllb-200-distilled-600M-ct2-int8"

    cors_origins: list[str] = ["http://localhost:3000", "http://127.0.0.1:3000", "*"]


settings = Settings()
