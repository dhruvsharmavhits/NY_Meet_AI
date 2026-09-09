import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.admin.router import router as admin_router
from app.config import settings
from app.database import Base, engine
from app.meetings.router import router as meetings_router
from app.models import (  # noqa: F401 (registers models on Base)
    ConsultationSession,
    Meeting,
    MeetingParticipant,
    PatientLink,
    TranscriptEntry,
    User,
    UserSettings,
)
from app.patients.router import router as patients_router
from app.translation.translator import warmup as warmup_translator
from app.users.router import router as users_router


def _migrate_schema() -> None:
    with engine.begin() as conn:
        try:
            conn.execute(text("ALTER TABLE transcript_entries ADD COLUMN session_id VARCHAR(36)"))
        except Exception:
            pass
    with engine.begin() as conn:
        try:
            conn.execute(text("ALTER TABLE consultation_sessions ADD COLUMN access_token VARCHAR(64)"))
        except Exception:
            pass


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    _migrate_schema()
    asyncio.create_task(asyncio.to_thread(warmup_translator))
    yield


app = FastAPI(title=settings.app_name, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


app.include_router(meetings_router)
app.include_router(users_router)
app.include_router(admin_router)
app.include_router(patients_router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
