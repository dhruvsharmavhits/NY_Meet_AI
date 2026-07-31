# Running LinguaMeet

A practical guide to actually getting this running and using every feature. For what was built and why, see `PROGRESS.md`. For the original spec, see `README.md`.

---

## 1. Prerequisites

- **Python 3.10+**
- **Node.js 18+** (this project was built/tested with Node v24.18.0 via [nvm](https://github.com/nvm-sh/nvm) — no system Node was required)
- **~2GB free disk** for the AI models (Faster Whisper `base` + NLLB-200 distilled-600M, downloaded once)
- **ffmpeg** — only needed if you want to regenerate test audio yourself; not required to run the app
- A webcam + microphone (or virtual devices) to actually test video/audio/captions in a browser
- Two browser windows/profiles (or one normal + one incognito) to test a meeting with more than one participant, since there's only one machine

No paid API keys are needed anywhere in this stack — everything (STT, translation, video/audio, chat) runs locally/free.

---

## 2. One-time setup

### Backend

```bash
cd backend
python3 -m venv .venv
./.venv/bin/pip install -r requirements.txt
cp .env.example .env
```

Then download the NLLB-200 translation model (this is the one model that does **not** auto-download — Faster Whisper downloads itself on first use):

```bash
./.venv/bin/python -c "
from huggingface_hub import snapshot_download
snapshot_download('JustFrederik/nllb-200-distilled-600M-ct2-int8', local_dir='models/nllb-200-distilled-600M-ct2-int8')
"
```

This pulls ~650MB. `backend/models/` is gitignored, so every fresh clone needs this step once.

### Frontend

```bash
cd frontend
cp .env.example .env
```

If Node isn't installed yet:

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"
nvm install --lts
```

Then:

```bash
npm install
```

---

## 3. Running it

**Important:** the backend must be started via `app.asgi:application`, not `app.main:app` — the Socket.IO server (chat, WebRTC signaling, live captions) is only mounted on the combined ASGI app.

**Also important:** pick a port that's actually free. Port 8000 is a common default and may already be in use by something else on your machine.

### Backend (from `backend/`)

```bash
./.venv/bin/uvicorn app.asgi:application --port 8001
```

First request that touches transcription will load the Whisper model (a few seconds); first translation request loads NLLB (similarly). Both are lazy-loaded singletons, so only the very first caption in a session pays this cost.

### Frontend (from `frontend/`)

```bash
export NEXT_PUBLIC_API_URL=http://localhost:8001   # match whatever port you ran the backend on
npm run build && npm run start
```

Then open **http://localhost:3000**.

> `npm run dev` (hot reload) may fail with `ENOSPC: System limit for number of file watchers reached` on Linux systems with a low `fs.inotify.max_user_watches` (common when an editor + language servers are also running). Fix with `sudo sysctl fs.inotify.max_user_watches=524288`, or just use `build && start` for a static run — no watching needed either way.

---

## 4. Using it — a full walkthrough

1. First visit prompts for a display name (no login/register — a lightweight temp user is created from just that name).
2. You land on the **dashboard**. Two options:
   - **Create a meeting**: give it a title, click Create — you're dropped straight into the room (instant meetings go live immediately; no separate "start" step).
   - **Join a meeting**: paste a room code (e.g. `a1b2-c3d4-e5f6`) from someone else and click Join.
3. To actually test multi-participant features, open the same room code in a second browser (incognito window works well) with a different display name.
4. In the **meeting room**, your browser will prompt for camera/mic permission — allow it. If you deny it or no device exists, you'll see a red banner rather than a silent failure.
5. **Toolbar buttons**, left to right:
   - **Mic on/off** — mutes your outgoing audio track locally (doesn't stop capture, just disables the track).
   - **Camera on/off** — same, for video.
   - **Share screen / Stop sharing** — swaps your outgoing video track for a screen-share stream via `getDisplayMedia`; auto-reverts to camera if you stop sharing from the browser's own UI.
   - **Captions: original / Captions: translated** — toggles whether the live caption overlay shows the speaker's original language or your own `caption_language` (set in Settings). Falls back to original if no translation exists for that language pair.
   - **Chat** — opens a side panel, Socket.IO-broadcast text chat to the whole room.
   - **Participants** — side panel listing everyone currently in the room.
   - **Transcript** — side panel showing the growing speech-to-text transcript (persisted server-side, polled every 5s), with a "Download transcript (.txt)" button.
   - **Summary** — a modal with auto-generated meeting stats: duration, participant list, languages spoken, caption count, and a handful of highlight lines pulled from the transcript. This is **not** an AI-written summary (no LLM in this stack) — it's clearly labeled as heuristic stats.
   - **Record / Stop recording** — records a composited grid of everyone's video plus mixed audio from everyone currently visible, entirely client-side via `MediaRecorder` + canvas. On stop, uploads the `.webm` to the backend (`storage/recordings/<meeting-id>/`).
   - **Leave** — leaves the room and returns to the dashboard.
6. **Live captions**: speak into your mic. After ~3 seconds of audio, a caption appears as an overlay on the video (position/font size from your Settings). The other participant, if they've set a different `caption_language`, sees the same speech translated into their language automatically — no action needed on either side.
7. **Settings page** (`/settings`, linked from the dashboard): set your caption language, caption position (top/bottom), font size, and dark mode. These take effect the next time you're in a meeting room (captions overlay reads them via a query, refetched per room-load).

---

## 5. Known limitations (by design, not oversights)

- **No LiveKit / no SFU** — video is a full peer-to-peer WebRTC mesh (everyone connects directly to everyone). This was an explicit choice to avoid needing a media server or paid infra, but it means bandwidth/CPU cost grows with the square of participant count. Fine for small meetings (~4-6 people), not built to scale beyond that.
- **STUN only, no TURN** — WebRTC connections may fail across strict/symmetric NATs or corporate firewalls. Works fine on the same network or typical home networks.
- **Caption latency is ~3+ seconds**, not the README's 300-800ms target — captions are generated from fixed 3-second non-overlapping audio windows per speaker, so there's an inherent floor on latency, and sentences that span a window boundary get cut off (the tail is dropped, not carried over). Documented as a real, known gap.
- **Recording captures a snapshot of who's in the call when you hit Record** — someone who joins mid-recording won't appear in the composited video (their audio also won't be captured until you restart the recording).
- **No true mobile-responsive redesign** — pages use Tailwind responsive classes where it was cheap (`sm:`/`lg:` grid breakpoints, wrapping toolbar) but haven't had a dedicated mobile-first pass.
- **Meeting "summary" is heuristic, not AI-generated** — stats and sampled transcript lines, not an LLM abstract. There's no LLM anywhere in this stack.

---

## 6. Troubleshooting

- **Port already in use** — check what's listening (`lsof -i :8000` or `ss -tlnp | grep 8000`) before assuming a port is free; pick another with `--port`.
- **`next dev` fails with ENOSPC** — see the file-watcher note in section 3.
- **`ModuleNotFoundError: torch`** — expected and harmless; this stack deliberately avoids torch (Faster Whisper and NLLB both run on the lighter CTranslate2 backend). If you see a warning like `[transformers] PyTorch was not found`, that's also expected — the `transformers` package here is only used for its tokenizer classes.
- **Translation returns `None` / caption never shows in a target language** — the speaker's detected language or the viewer's `caption_language` isn't in the supported list (`backend/app/translation/language_codes.py`, ~30 common languages). Add a mapping there if you need another language.
- **Camera/mic permission denied** — you'll see a red banner in the meeting room instead of a silent failure; grant the permission and refresh.
- **A fresh clone has no `backend/models/`** — re-run the `snapshot_download` command from section 2; Whisper will auto-download on first use regardless.

---

## 7. Exposing it publicly with ngrok (sharing a link with other people)

This account's ngrok plan only allows **one simultaneous tunnel**, and the two-tunnel setup (one for frontend, one for backend) hits `ERR_NGROK_334`. The working setup instead puts a single ngrok tunnel in front of the **frontend only**, and Next.js proxies API/Socket.IO calls to the backend internally so everything works through one URL/origin.

### One-time setup

- `frontend/next.config.js` has a `rewrites()` block that forwards `/meetings/*`, `/users/*`, `/health`, and `/socket.io/*` to `BACKEND_INTERNAL_URL` (defaults to `http://127.0.0.1:8001`).
- `frontend/.env` must have **`NEXT_PUBLIC_API_URL=`** (empty) — this tells `api.ts`/`socket.ts` to talk to the page's own origin (which Next.js then proxies), instead of a separate backend URL. This is a build-time value, so any change requires `npm run build` again.
- `frontend/src/services/socket.ts` uses `transports: ["polling", "websocket"]`, not websocket-only. **This matters**: Next.js's `rewrites()` proxy does not forward WebSocket `Upgrade` requests to the rewritten destination, only plain HTTP — a websocket-only client silently fails to connect through this setup. Socket.IO transparently falls back to (and stays on) HTTP long-polling, which works fine for chat/signaling/captions, just with a bit more latency than a raw WebSocket.

### Running it

```bash
# 1. Backend, bound so it's reachable from the Next.js proxy (localhost is fine, they're on the same machine)
cd backend
./.venv/bin/uvicorn app.asgi:application --host 0.0.0.0 --port 8001

# 2. Frontend — rebuild is required any time NEXT_PUBLIC_API_URL or next.config.js changes
cd frontend
npm run build
npm run start -- -H 0.0.0.0 -p 3000

# 3. One ngrok tunnel, pointed at the frontend only
ngrok http 3000
```

Share the `https://<something>.ngrok-free.dev` URL ngrok prints — that's the whole app (UI + API + realtime) behind one origin.

### Gotchas

- **First-time visitors see an ngrok interstitial page** ("You are about to visit... Visit Site" button) on the free plan — expected, not a bug in this app. They click through once per browser.
- **`getUserMedia` (camera/mic) requires HTTPS or localhost** — this is exactly why the tunnel matters: an ngrok `https://` URL satisfies that; a plain `http://<lan-ip>:3000` would not let camera/mic work for other people on your network.
- **CORS is wide open (`allow_origins=["*"]`)** in `backend/app/main.py`. There's no login, so anyone with the link can create/join meetings — fine for casual sharing, not for anything sensitive.
- **The free ngrok domain isn't fixed across restarts** unless you've reserved a static domain on your ngrok account — a new `ngrok http 3000` run may print a different URL each time. If you have a reserved domain, use `ngrok http --url=<your-reserved-domain> 3000`.
- If you switch back to purely local development, remember to revert `NEXT_PUBLIC_API_URL` to a real value (or keep it empty and run the backend on the same host/port the proxy expects) and rebuild.
