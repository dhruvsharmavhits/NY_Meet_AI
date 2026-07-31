# LinguaMeet

Real-time multilingual video collaboration platform. Users speak different languages, video calls include live transcription + translation, original speaker's voice is preserved.

Production-quality MVP demo. Only 3 simplifications vs real production:
1. SQLite instead of PostgreSQL
2. Local file storage instead of S3
3. Single FastAPI monolith instead of microservices

Everything else must behave like a real production app.

---

## HOW TO WORK ON THIS PROJECT (Claude Code — read this first)

This project is built incrementally across many sessions/context resets. Before doing anything:

1. Read `PROGRESS.md` in the repo root. It tracks exactly what's done, what's in progress, and what's next.
2. Resume from the "IN PROGRESS" task in `PROGRESS.md`. Do not restart finished phases.
3. After finishing any task (even partial), immediately update `PROGRESS.md`:
   - Move finished items to `DONE`
   - Update `IN PROGRESS` with exact next step + file/function you stopped at
   - Note any blockers, TODOs, or decisions made
4. Commit-sized increments: don't try to build multiple phases in one go. Finish one module, update PROGRESS.md, stop.
5. If `PROGRESS.md` doesn't exist yet, create it using the template at the bottom of this file, then start Phase 1.

This is what makes the project resumable after a usage limit reset: the next session just needs to read `PROGRESS.md` + this file to know exactly where to continue.

---

## Tech Stack

**Frontend:** Next.js, React, TypeScript, TailwindCSS, LiveKit React SDK, WebRTC, Socket.IO Client, TanStack Query, Zustand

**Backend:** Python, FastAPI, Uvicorn, Socket.IO, AsyncIO, Pydantic, SQLAlchemy, SQLite, JWT Auth

**AI Stack:**
- Speech Recognition: Deepgram Nova-3 (paid) or Faster Whisper / NVIDIA Parakeet (free)
- Translation: Google Cloud Translation (paid) or Meta NLLB-200 (free)

---

## Architecture

Single FastAPI application, modular internally so modules can later be split into services.

```
FastAPI
├── Authentication Module
├── Meeting Module
├── User Module
├── WebRTC Module
├── Live Translation Module
├── Speech Recognition Module
├── Caption Module
├── Chat Module
├── Recording Module
└── File Upload Module
```

### Backend folder structure
```
backend/app/
├── api/
├── auth/
├── users/
├── meetings/
├── speech/
├── translation/
├── captions/
├── websocket/
├── chat/
├── media/
├── recording/
├── storage/
├── ai/
├── utils/
├── config/
├── models/
├── schemas/
├── services/
└── main.py
```

### Frontend folder structure
```
frontend/src/
├── components/
├── pages/
├── hooks/
├── services/
├── meeting/
├── translation/
├── captions/
├── chat/
├── store/
├── utils/
└── styles/
```

### Storage layout
```
storage/
├── recordings/
├── screenshots/
├── avatars/
└── exports/
```
Local now, swap `save_file()` → `upload_to_s3()` later with no frontend changes.

---

## Core Flows

**Meeting flow:**
Create Meeting → Meeting ID Generated → Share Link → Participant Joins → Video Connected → Audio Connected → AI Starts Listening → Captions Begin → Translation Begins → Users Talk Normally

**Live translation flow:**
Microphone → Voice Activity Detection → Streaming Speech Recognition → Partial Transcript → Translation → Caption Formatter → Socket Event → Display Caption

**Caption flow (per participant):**
Speaker's audio → transcript in speaker's language → translated into every other participant's chosen language → each participant receives captions only in their own language.

**Auth flow:**
Register → Login → JWT Token → Join Meeting (no OAuth for MVP; add Google/Microsoft/GitHub login later)

---

## UI Pages

- **Auth:** Login, Register
- **Dashboard:** Upcoming Meetings, Create Meeting, Join Meeting, Recent Meetings, Profile, Settings
- **Meeting Room:** Video grid, Participants, Chat, Captions, Translation, Screen Share, Mic, Camera, Raise Hand, Settings, Leave
- **Caption Panel:** Original text, Translated text, Speaker name, Timestamp, Language badge
- **Settings:** Camera, Mic, Speaker, Caption language, Font size, Caption position, Dark mode
- **Meeting toolbar:** Mic, Camera, Share Screen, Chat, Participants, Captions, Translation, Record, Settings, Leave

---

## Performance Targets

| Metric | Target |
|---|---|
| Video join time | < 2s |
| Caption latency | 300–800ms |
| Translation latency | 500–1000ms |
| Meeting start time | < 3s |
| Screen share startup | < 2s |

---

## Development Phases (build in this order)

### Phase 1 — Foundation
- JWT authentication (register/login)
- Dashboard UI
- Meeting creation
- Meeting join flow
- SQLite integration (models: User, Meeting, Settings)
- Basic settings page

### Phase 2 — Communication
- Live video (LiveKit/WebRTC)
- Live audio
- Chat (Socket.IO)
- Screen sharing
- Participant list
- Meeting controls toolbar

### Phase 3 — AI Features
- Streaming Speech-to-Text
- Speaker detection
- Live captions
- Per-user language selection
- Streaming translation
- Toggle original/translated captions

### Phase 4 — Polish
- Recording
- Transcript download
- Meeting summary
- Responsive UI
- Animations / loading states
- Error handling
- Reconnection logic

---

## Future Production Upgrades (not part of MVP, just keep architecture ready)

- SQLite → PostgreSQL
- Local storage → S3 / Cloud Storage
- Monolith → Microservices
- Single server → Docker + Kubernetes
- Local AI models → Managed cloud AI / dedicated GPU inference
- Basic auth → Enterprise SSO / OAuth

---

## PROGRESS.md template (create this file if missing)

```markdown
# LinguaMeet — Progress Tracker

Last updated: <date>

## Current Phase
Phase 1 — Foundation

## DONE
- (nothing yet)

## IN PROGRESS
- Task:
- File/function where work stopped:
- Next exact step:

## BLOCKED / DECISIONS NEEDED
- (none yet)

## NOTES
- (paid vs free AI provider choice, env vars needed, etc.)
```
