import type { ConsultationSession, TranscriptEntry } from "@/services/api";
import type { Caption, ChatMessage, Participant } from "@/meeting/types";

export interface CompositorState {
  roomCode: string;
  currentTime: string;
  elapsedLabel: string;
  connected: boolean;
  reconnecting: boolean;
  error: string | null;
  displayName: string;
  localStream: MediaStream | null;
  screenStream: MediaStream | null;
  remoteStreams: Record<string, MediaStream>;
  remoteScreenStreams: Record<string, MediaStream>;
  participants: Record<string, Participant>;
  micOn: boolean;
  micConnecting: boolean;
  cameraOn: boolean;
  screenSharing: boolean;
  captionsOn: boolean;
  captions: Caption[];
  myCaptionLanguage: string;
  captionPosition: "top" | "bottom";
  captionFontSize: number;
  showOriginalCaptions: boolean;
  chatOpen: boolean;
  messages: ChatMessage[];
  participantsOpen: boolean;
  transcriptOpen: boolean;
  transcriptEntries: TranscriptEntry[];
  queueOpen: boolean;
  queue: ConsultationSession[];
  showQueue: boolean;
  moreMenuOpen: boolean;
}

export const RECORDING_WIDTH = 1280;
export const RECORDING_HEIGHT = 720;
export const RECORDING_FPS = 30;

// The layout is authored at 1920x1080 and scaled down to the output size, so
// encoding costs less without every coordinate changing.
const W = 1920;
const H = 1080;
const SCALE = RECORDING_WIDTH / W;
const HEADER_H = 52;
const TOOLBAR_H = 72;
const FONT_STACK = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

const ICONS: Record<string, string[]> = {
  mic: [
    "M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z",
    "M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z",
  ],
  micOff: [
    "M19 11h-1.7c0 .74-.16 1.43-.43 2.05l1.23 1.23c.56-.98.9-2.09.9-3.28zm-4.02.17c0-.06.02-.11.02-.17V5c0-1.66-1.34-3-3-3S9 3.34 9 5v.18l5.98 5.99zM4.27 3L3 4.27l6.01 6.01V11c0 1.66 1.33 3 2.99 3 .22 0 .44-.03.65-.08l1.66 1.66c-.71.33-1.5.52-2.31.52-2.76 0-5.3-2.1-5.3-5.1H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c.91-.13 1.77-.45 2.54-.9L19.73 21 21 19.73 4.27 3z",
  ],
  videocam: ["M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"],
  videocamOff: [
    "M21 6.5l-4 4V7c0-.55-.45-1-1-1H9.82L21 17.18V6.5zM3.27 2L2 3.27 4.73 6H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.21 0 .39-.08.54-.18L19.73 21 21 19.73 3.27 2z",
  ],
  screenShare: [
    "M20 18c1.1 0 1.99-.9 1.99-2L22 6c0-1.11-.9-2-2-2H4c-1.11 0-2 .89-2 2v10c0 1.1.89 2 2 2H0v2h24v-2h-4zm-7-3.53v-2.19c-2.78 0-4.61.85-6 2.72.56-2.67 2.11-5.33 6-5.87V7l4 3.73-4 3.74z",
  ],
  stopScreenShare: [
    "M21.22 18.02l2 2H24v-2h-2.78zM1.22 2L0 3.22l1 1V18c0 1.1.89 2 2 2h12l2 2h3.78l1 1L23 21.78 1.22 2zM7 15c0-1.57.75-2.96 1.91-3.83L14 16.27c-.71.5-1.47.73-2 .73-2.21 0-4-1.79-4-4v2zm14-9H7.66l6.52 6.52c2.04-.37 3.6-1.77 4.32-3.52H20v-1h-1.34c-.12-.34-.28-.67-.46-.98L22 3.22 20.78 2 18.02 4.76C17.4 4.29 16.72 4 16 4H5.22l2 2H20v10.78l1-1V6z",
  ],
  callEnd: [
    "M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08c-.18-.17-.29-.42-.29-.7 0-.28.11-.53.29-.71C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67c.18.18.29.43.29.71 0 .28-.11.53-.29.71l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.11-.7-.28-.79-.74-1.69-1.36-2.67-1.85-.33-.16-.56-.5-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z",
  ],
  chat: ["M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z"],
  people: [
    "M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z",
  ],
  moreVert: [
    "M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z",
  ],
  captions: [
    "M19 4H5c-1.11 0-2 .9-2 2v12c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm-8 7H9.5v-.5h-2v3h2V13H11v1c0 .55-.45 1-1 1H7c-.55 0-1-.45-1-1v-4c0-.55.45-1 1-1h3c.55 0 1 .45 1 1v1zm7 0h-1.5v-.5h-2v3h2V13H18v1c0 .55-.45 1-1 1h-3c-.55 0-1-.45-1-1v-4c0-.55.45-1 1-1h3c.55 0 1 .45 1 1v1z",
  ],
  close: ["M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"],
  send: ["M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"],
  transcript: ["M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"],
  summary: ["M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"],
  queue: ["M4 6h16v2H4V6zm0 5h16v2H4v-2zm0 5h10v2H4v-2z"],
  stop: ["M6 6h12v12H6z"],
  error: ["M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"],
};

const pathCache = new Map<string, Path2D[]>();

function iconPaths(name: string): Path2D[] {
  let paths = pathCache.get(name);
  if (!paths) {
    paths = (ICONS[name] ?? []).map((d) => new Path2D(d));
    pathCache.set(name, paths);
  }
  return paths;
}

const TILE_COLORS = ["#7c3aed", "#4285f4", "#f97316", "#0f9d58", "#ea4335", "#2563eb", "#d946ef", "#059669", "#e11d48", "#8b5cf6"];
const PANEL_COLORS = ["#c084fc", "#60a5fa", "#fb923c", "#34d399", "#f87171", "#818cf8", "#fbbf24", "#a78bfa", "#f472b6", "#22d3ee"];
const CAPTION_COLORS = ["#c58af9", "#8ab4f8", "#fcad70", "#81c995", "#f28b82", "#78d9ec", "#fdd663", "#a8dab5", "#f6aea9", "#b39ddb"];

function hashName(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return Math.abs(hash);
}

function pickColor(palette: string[], name: string): string {
  return palette[hashName(name) % palette.length];
}

function tileInitials(name: string): string {
  const cleaned = name.replace(/\s*\(you\)\s*$/i, "").trim();
  if (!cleaned) return "?";
  const parts = cleaned.split(/\s+/);
  return parts.length === 1 ? parts[0][0].toUpperCase() : (parts[0][0] + parts[1][0]).toUpperCase();
}

function panelInitials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "?";
  const parts = trimmed.split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || trimmed[0].toUpperCase();
}

interface Tile {
  key: string;
  video: HTMLVideoElement | null;
  hasStream: boolean;
  label: string;
  micMuted?: boolean;
  cameraOff?: boolean;
  mirrored?: boolean;
}

export class MeetingCompositor {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private videoEls = new Map<string, HTMLVideoElement>();
  private state: CompositorState | null = null;
  private rafId: number | null = null;
  private ticker: Worker | null = null;

  constructor() {
    this.canvas = document.createElement("canvas");
    this.canvas.width = RECORDING_WIDTH;
    this.canvas.height = RECORDING_HEIGHT;
    const ctx = this.canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("2D canvas is unavailable");
    this.ctx = ctx;
    this.ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
    this.ctx.imageSmoothingEnabled = true;
    this.ctx.imageSmoothingQuality = "high";
  }

  setState(state: CompositorState) {
    this.state = state;
    const live = new Set<string>();
    const track = (key: string, stream: MediaStream | null) => {
      if (!stream || stream.getVideoTracks().length === 0) return;
      live.add(key);
      let el = this.videoEls.get(key);
      if (!el) {
        el = document.createElement("video");
        el.autoplay = true;
        el.playsInline = true;
        el.muted = true;
        this.videoEls.set(key, el);
      }
      const current = el.srcObject as MediaStream | null;
      const wanted = stream.getVideoTracks();
      const same = current && current.getVideoTracks().length === wanted.length && current.getVideoTracks().every((t, i) => t === wanted[i]);
      if (!same) {
        el.srcObject = new MediaStream(wanted);
        el.play().catch(() => {});
      }
    };

    track("local", state.localStream);
    track("local-screen", state.screenStream);
    for (const sid of Object.keys(state.remoteStreams)) track(sid, state.remoteStreams[sid]);
    for (const sid of Object.keys(state.remoteScreenStreams)) track(`${sid}-screen`, state.remoteScreenStreams[sid]);

    for (const key of Array.from(this.videoEls.keys())) {
      if (!live.has(key)) {
        const el = this.videoEls.get(key);
        if (el) {
          el.pause();
          el.srcObject = null;
        }
        this.videoEls.delete(key);
      }
    }
  }

  captureStream(fps: number): MediaStream {
    return (this.canvas as HTMLCanvasElement & { captureStream(fps?: number): MediaStream }).captureStream(fps);
  }

  // A worker timer keeps ticking at full rate while the tab is in the
  // background, where requestAnimationFrame would drop to ~1fps and freeze the
  // recorded video against the audio that keeps running.
  startLoop() {
    if (this.ticker || this.rafId !== null) return;
    const interval = Math.round(1000 / RECORDING_FPS);
    try {
      const source = `let id=null;onmessage=(e)=>{if(e.data==="stop"){clearInterval(id);id=null;}else{id=setInterval(()=>postMessage(0),e.data);}}`;
      const url = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
      const worker = new Worker(url);
      URL.revokeObjectURL(url);
      worker.onmessage = () => this.draw();
      worker.postMessage(interval);
      this.ticker = worker;
    } catch {
      const loop = () => {
        this.draw();
        this.rafId = requestAnimationFrame(loop);
      };
      loop();
    }
  }

  stopLoop() {
    if (this.ticker) {
      this.ticker.postMessage("stop");
      this.ticker.terminate();
      this.ticker = null;
    }
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.rafId = null;
    this.videoEls.forEach((el) => {
      el.pause();
      el.srcObject = null;
    });
    this.videoEls.clear();
  }

  // ---------- primitives ----------

  private font(weight: number, size: number) {
    this.ctx.font = `${weight} ${size}px ${FONT_STACK}`;
  }

  private roundRect(x: number, y: number, w: number, h: number, r: number) {
    const ctx = this.ctx;
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  private fillRoundRect(x: number, y: number, w: number, h: number, r: number, fill: string | CanvasGradient) {
    this.roundRect(x, y, w, h, r);
    this.ctx.fillStyle = fill;
    this.ctx.fill();
  }

  private fillCircle(cx: number, cy: number, r: number, fill: string | CanvasGradient) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
  }

  private diagonalGradient(x: number, y: number, w: number, h: number, stops: [number, string][]): CanvasGradient {
    const grad = this.ctx.createLinearGradient(x, y, x + w, y + h);
    stops.forEach(([offset, color]) => grad.addColorStop(offset, color));
    return grad;
  }

  private drawIcon(name: string, cx: number, cy: number, size: number, color: string) {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(cx - size / 2, cy - size / 2);
    ctx.scale(size / 24, size / 24);
    ctx.fillStyle = color;
    for (const path of iconPaths(name)) ctx.fill(path);
    ctx.restore();
  }

  private textWidth(text: string, weight: number, size: number): number {
    this.font(weight, size);
    return this.ctx.measureText(text).width;
  }

  private truncate(text: string, maxWidth: number): string {
    const ctx = this.ctx;
    if (ctx.measureText(text).width <= maxWidth) return text;
    let out = text;
    while (out.length > 1 && ctx.measureText(`${out}…`).width > maxWidth) out = out.slice(0, -1);
    return `${out}…`;
  }

  private wrap(text: string, maxWidth: number): string[] {
    const ctx = this.ctx;
    const lines: string[] = [];
    for (const paragraph of text.split("\n")) {
      let line = "";
      for (const word of paragraph.split(/\s+/)) {
        const candidate = line ? `${line} ${word}` : word;
        if (ctx.measureText(candidate).width <= maxWidth || !line) {
          line = candidate;
        } else {
          lines.push(line);
          line = word;
        }
      }
      lines.push(line);
    }
    return lines;
  }

  // ---------- frame ----------

  private draw() {
    const s = this.state;
    const ctx = this.ctx;

    ctx.fillStyle = "#0f0c29";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = this.diagonalGradient(0, 0, W, H, [
      [0, "#0f0c29"],
      [0.5, "#1a1a2e"],
      [1, "#16213e"],
    ]);
    ctx.fillRect(0, 0, W, H);
    if (!s) return;

    this.drawHeader(s);

    let mainTop = HEADER_H;
    if (s.error) mainTop = this.drawErrorBanner(s.error, mainTop);

    const panelW = s.chatOpen || s.participantsOpen ? 320 : s.transcriptOpen || (s.queueOpen && s.showQueue) ? 360 : 0;
    const mainH = H - TOOLBAR_H - mainTop;
    const mainW = W - panelW;

    this.drawVideoArea(0, mainTop, mainW, mainH, s);
    if (s.captionsOn) this.drawCaptions(0, mainTop, mainW, mainH, s);
    if (panelW > 0) this.drawPanel(W - panelW, mainTop, panelW, mainH, s);

    this.drawToolbar(s);
    if (s.moreMenuOpen) this.drawMoreMenu(s);
  }

  private drawHeader(s: CompositorState) {
    const ctx = this.ctx;
    ctx.fillStyle = "rgba(15,12,41,0.5)";
    ctx.fillRect(0, 0, W, HEADER_H);
    ctx.textBaseline = "middle";
    const cy = HEADER_H / 2;

    let x = 16;
    this.font(500, 14);
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.fillText(s.currentTime, x, cy);
    x += ctx.measureText(s.currentTime).width + 12;

    const codeW = this.textWidth(s.roomCode, 600, 12) + 28;
    this.fillRoundRect(x, cy - 14, codeW, 28, 12, "rgba(255,255,255,0.08)");
    ctx.fillStyle = "rgba(255,255,255,0.8)";
    ctx.fillText(s.roomCode, x + 14, cy);
    x += codeW + 12;

    const recW = this.textWidth("REC", 700, 12) + 28 + 8 + 8;
    this.fillRoundRect(x, cy - 14, recW, 28, 12, "rgba(234,67,53,0.15)");
    const pulse = 0.55 + 0.45 * Math.abs(Math.sin(performance.now() / 1000));
    ctx.globalAlpha = pulse;
    this.fillCircle(x + 14 + 4, cy, 4, "#ea4335");
    ctx.globalAlpha = 1;
    this.font(700, 12);
    ctx.fillStyle = "#ff6b6b";
    ctx.fillText("REC", x + 14 + 8 + 8, cy);

    let right = W - 16;
    const avatarSize = 36;
    this.fillRoundRect(right - avatarSize, cy - avatarSize / 2, avatarSize, avatarSize, 12, this.diagonalGradient(right - avatarSize, cy - avatarSize / 2, avatarSize, avatarSize, [
      [0, "#7c3aed"],
      [1, "#4285f4"],
    ]));
    this.font(700, 12);
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.fillText((s.displayName || "U").charAt(0).toUpperCase(), right - avatarSize / 2, cy);
    ctx.textAlign = "left";
    right -= avatarSize + 12;

    this.font(500, 12);
    const durW = ctx.measureText(s.elapsedLabel).width;
    ctx.fillStyle = "rgba(255,255,255,0.4)";
    ctx.fillText(s.elapsedLabel, right - durW, cy);
    right -= durW + 12;

    if (!s.connected) {
      const label = s.reconnecting ? "Reconnecting..." : "Connecting...";
      const badgeW = this.textWidth(label, 500, 12) + 28 + 8 + 8;
      this.fillRoundRect(right - badgeW, cy - 14, badgeW, 28, 12, "rgba(244,180,0,0.15)");
      const spin = (performance.now() / 1000) * Math.PI * 2;
      ctx.strokeStyle = "#fbbf24";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(right - badgeW + 18, cy, 4, spin, spin + Math.PI * 1.5);
      ctx.stroke();
      this.font(500, 12);
      ctx.fillStyle = "#fbbf24";
      ctx.fillText(label, right - badgeW + 30, cy);
    }
  }

  private drawErrorBanner(message: string, top: number): number {
    const ctx = this.ctx;
    const x = 12;
    const w = W - 24;
    const h = 44;
    this.fillRoundRect(x, top, w, h, 16, "rgba(234,67,53,0.1)");
    this.drawIcon("error", x + 20 + 9, top + h / 2, 18, "#ff6b6b");
    this.font(500, 14);
    ctx.fillStyle = "#ff6b6b";
    ctx.textBaseline = "middle";
    ctx.fillText(this.truncate(message, w - 70), x + 20 + 18 + 8, top + h / 2);
    return top + h + 8;
  }

  private buildTiles(s: CompositorState): { pinned: Tile | null; strip: Tile[] } {
    const sids = Object.keys(s.participants);
    const sharingSid = sids.find((sid) => s.participants[sid]?.screenSharing);

    const strip: Tile[] = [
      {
        key: "local",
        video: this.videoEls.get("local") ?? null,
        hasStream: !!s.localStream,
        label: `${s.displayName || "You"} (you)`,
        micMuted: !s.micOn,
        cameraOff: !s.cameraOn,
        mirrored: true,
      },
      ...sids.map((sid) => ({
        key: sid,
        video: this.videoEls.get(sid) ?? null,
        hasStream: !!s.remoteStreams[sid],
        label: s.participants[sid]?.full_name ?? "Participant",
        micMuted: s.participants[sid]?.micOn === false,
        cameraOff: s.participants[sid]?.cameraOn === false,
      })),
    ];

    const pinned: Tile | null = s.screenSharing
      ? { key: "local-screen", video: this.videoEls.get("local-screen") ?? null, hasStream: !!s.screenStream, label: "You're presenting" }
      : sharingSid
        ? {
            key: `${sharingSid}-screen`,
            video: this.videoEls.get(`${sharingSid}-screen`) ?? null,
            hasStream: !!s.remoteScreenStreams[sharingSid],
            label: `${s.participants[sharingSid]?.full_name ?? "Participant"} is presenting`,
          }
        : null;

    return { pinned, strip };
  }

  private drawVideoArea(x: number, y: number, w: number, h: number, s: CompositorState) {
    const { pinned, strip } = this.buildTiles(s);
    const pad = 12;
    const gap = 8;

    if (pinned) {
      const stripW = 220;
      this.drawTile(x + pad, y + pad, w - pad * 2 - stripW - gap, h - pad * 2, pinned);
      const sx = x + w - pad - stripW;
      const tileH = 128;
      strip.forEach((tile, i) => {
        const ty = y + pad + i * (tileH + gap);
        if (ty + tileH > y + h - pad) return;
        this.drawTile(sx, ty, stripW, tileH, tile);
      });
      return;
    }

    const n = strip.length;
    const cols = n <= 1 ? 1 : n === 2 ? 2 : n <= 4 ? 2 : n <= 6 ? 3 : 4;
    const rows = Math.ceil(n / cols);
    const cellW = (w - pad * 2 - gap * (cols - 1)) / cols;
    const cellH = (h - pad * 2 - gap * (rows - 1)) / rows;

    strip.forEach((tile, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      this.drawTile(x + pad + col * (cellW + gap), y + pad + row * (cellH + gap), cellW, cellH, tile);
    });
  }

  private drawTile(x: number, y: number, w: number, h: number, tile: Tile) {
    if (w <= 1 || h <= 1) return;
    const ctx = this.ctx;
    ctx.save();
    this.roundRect(x, y, w, h, 16);
    ctx.clip();
    ctx.fillStyle = "#1e1e2e";
    ctx.fillRect(x, y, w, h);

    const video = tile.video;
    const ready = !!video && video.readyState >= 2 && video.videoWidth > 0;
    const showAvatar = !tile.hasStream || tile.cameraOff || !ready;

    if (!showAvatar && video) {
      const scale = Math.min(w / video.videoWidth, h / video.videoHeight);
      const dw = video.videoWidth * scale;
      const dh = video.videoHeight * scale;
      const dx = x + (w - dw) / 2;
      const dy = y + (h - dh) / 2;
      if (tile.mirrored) {
        ctx.save();
        ctx.translate(dx + dw, dy);
        ctx.scale(-1, 1);
        ctx.drawImage(video, 0, 0, dw, dh);
        ctx.restore();
      } else {
        ctx.drawImage(video, dx, dy, dw, dh);
      }
    } else {
      const color = pickColor(TILE_COLORS, tile.label);
      ctx.fillStyle = this.diagonalGradient(x, y, w, h, [
        [0, `${color}22`],
        [1, `${color}11`],
      ]);
      ctx.fillRect(x, y, w, h);
      const r = 48;
      ctx.save();
      ctx.shadowColor = `${color}44`;
      ctx.shadowBlur = 32;
      ctx.shadowOffsetY = 8;
      this.fillCircle(x + w / 2, y + h / 2, r, color);
      ctx.restore();
      this.font(600, Math.round(r * 0.62));
      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(tileInitials(tile.label), x + w / 2, y + h / 2 + 1);
      ctx.textAlign = "left";
    }

    const contentH = tile.micMuted ? 28 : 20;
    const barH = Math.min(contentH + 24, h);
    const barY = y + h - barH;
    const grad = ctx.createLinearGradient(0, y + h, 0, barY);
    grad.addColorStop(0, "rgba(0,0,0,0.7)");
    grad.addColorStop(0.5, "rgba(0,0,0,0.3)");
    grad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(x, barY, w, barH);

    let labelX = x + 16;
    const barCy = barY + barH / 2;
    if (tile.micMuted) {
      this.fillCircle(labelX + 14, barCy, 14, "rgba(234,67,53,0.9)");
      this.drawIcon("micOff", labelX + 14, barCy, 14, "#ffffff");
      labelX += 28 + 8;
    }
    this.font(500, 14);
    ctx.textBaseline = "middle";
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.5)";
    ctx.shadowBlur = 6;
    ctx.shadowOffsetY = 2;
    ctx.fillStyle = "#ffffff";
    ctx.fillText(this.truncate(tile.label, x + w - 16 - labelX), labelX, barCy);
    ctx.restore();
    ctx.restore();
  }

  private drawCaptions(x: number, y: number, w: number, h: number, s: CompositorState) {
    const recent = s.captions.slice(-3);
    if (recent.length === 0) return;
    const ctx = this.ctx;
    const size = s.captionFontSize || 16;
    const lineH = Math.round(size * 1.5);
    const bubbleH = lineH + 16;
    const gap = 6;
    const maxW = Math.min(768, w - 64);

    const stackH = recent.length * bubbleH + (recent.length - 1) * gap;
    let top = s.captionPosition === "top" ? y + 16 : y + h - 24 - stackH;

    for (const c of recent) {
      const translated = c.translations[s.myCaptionLanguage];
      const useOriginal = s.showOriginalCaptions || !translated;
      const text = useOriginal ? c.text : translated;
      const lang = (useOriginal ? c.lang : s.myCaptionLanguage).toUpperCase();

      const nameW = this.textWidth(c.full_name, 500, size);
      const gapAfterName = this.textWidth("  ", 500, size);
      const textW = this.textWidth(text, 400, size);
      const langW = this.textWidth(lang, 500, 10) + 12;
      const inner = Math.min(nameW + gapAfterName + textW + 8 + langW, maxW - 32);
      const bubbleW = inner + 32;
      const bx = x + (w - bubbleW) / 2;

      this.fillRoundRect(bx, top, bubbleW, bubbleH, 8, "rgba(32,33,36,0.9)");
      ctx.textBaseline = "middle";
      const cy = top + bubbleH / 2;
      let cx = bx + 16;
      this.font(500, size);
      ctx.fillStyle = pickColor(CAPTION_COLORS, c.full_name);
      ctx.fillText(c.full_name, cx, cy);
      cx += nameW + gapAfterName;
      this.font(400, size);
      ctx.fillStyle = "#ffffff";
      const availText = bx + bubbleW - 16 - langW - 8 - cx;
      ctx.fillText(this.truncate(text, availText), cx, cy);

      const chipX = bx + bubbleW - 16 - langW;
      this.fillRoundRect(chipX, cy - 8, langW, 16, 4, "rgba(255,255,255,0.15)");
      this.font(500, 10);
      ctx.fillStyle = "rgba(255,255,255,0.7)";
      ctx.fillText(lang, chipX + 6, cy);

      top += bubbleH + gap;
    }
  }

  // ---------- panels ----------

  private drawPanelShell(x: number, y: number, w: number, h: number, title: string) {
    const ctx = this.ctx;
    ctx.fillStyle = "rgba(15,12,41,0.85)";
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = "rgba(255,255,255,0.06)";
    ctx.fillRect(x, y, 1, h);

    const headerH = 68;
    this.font(700, 16);
    ctx.fillStyle = "#ffffff";
    ctx.textBaseline = "middle";
    ctx.fillText(title, x + 20, y + headerH / 2);
    this.drawIcon("close", x + w - 20 - 18, y + headerH / 2, 18, "rgba(255,255,255,0.5)");
    return y + headerH;
  }

  private drawPanel(x: number, y: number, w: number, h: number, s: CompositorState) {
    if (s.chatOpen) return this.drawChatPanel(x, y, w, h, s);
    if (s.participantsOpen) return this.drawParticipantsPanel(x, y, w, h, s);
    if (s.transcriptOpen) return this.drawTranscriptPanel(x, y, w, h, s);
    if (s.queueOpen) return this.drawQueuePanel(x, y, w, h, s);
  }

  private drawEmptyState(x: number, y: number, w: number, icon: string, primary: string, secondary?: string) {
    const ctx = this.ctx;
    const cx = x + w / 2;
    let top = y + 64;
    this.fillRoundRect(cx - 28, top, 56, 56, 16, "rgba(255,255,255,0.05)");
    this.drawIcon(icon, cx, top + 28, 28, "rgba(255,255,255,0.2)");
    top += 56 + 16;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    this.font(400, 14);
    ctx.fillStyle = "rgba(255,255,255,0.3)";
    ctx.fillText(primary, cx, top + 10);
    if (secondary) {
      top += 20 + 4;
      this.font(400, 12);
      ctx.fillStyle = "rgba(255,255,255,0.15)";
      ctx.fillText(secondary, cx, top + 8);
    }
    ctx.textAlign = "left";
  }

  private drawChatPanel(x: number, y: number, w: number, h: number, s: CompositorState) {
    const ctx = this.ctx;
    const contentTop = this.drawPanelShell(x, y, w, h, "Messages");
    const inputH = 70;
    const listBottom = y + h - inputH;

    if (s.messages.length === 0) {
      this.drawEmptyState(x, contentTop, w, "chat", "Messages are visible to everyone");
    } else {
      const textW = w - 40 - 32;
      this.font(400, 14);
      const blocks = s.messages.map((m) => ({ name: m.full_name, lines: this.wrap(m.text, textW) }));
      const heights = blocks.map((b) => 24 + 4 + b.lines.length * 23 + 16);
      const totalH = heights.reduce((sum, h) => sum + h, 0);

      ctx.save();
      ctx.beginPath();
      ctx.rect(x, contentTop, w, listBottom - contentTop);
      ctx.clip();

      // The live panel keeps itself scrolled to the newest message, so anything
      // taller than the viewport is anchored to the bottom instead of the top.
      let top = totalH <= listBottom - contentTop ? contentTop : listBottom - totalH;
      blocks.forEach((block, i) => {
        const color = pickColor(PANEL_COLORS, block.name);
        this.fillRoundRect(x + 20, top, 24, 24, 8, color);
        this.font(700, 9);
        ctx.fillStyle = "#ffffff";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(panelInitials(block.name), x + 32, top + 13);
        ctx.textAlign = "left";
        this.font(600, 12);
        ctx.fillStyle = color;
        ctx.fillText(this.truncate(block.name, w - 60 - 20), x + 52, top + 12);

        this.font(400, 14);
        ctx.fillStyle = "rgba(255,255,255,0.8)";
        block.lines.forEach((line, li) => {
          ctx.fillText(line, x + 52, top + 24 + 4 + li * 23 + 11);
        });
        top += heights[i];
      });
      ctx.restore();
    }

    ctx.fillStyle = "rgba(255,255,255,0.08)";
    ctx.fillRect(x, listBottom, w, 1);
    const fieldY = listBottom + 12;
    this.fillRoundRect(x + 16, fieldY, w - 16 - 8 - 40 - 8 - 16, 46, 12, "rgba(255,255,255,0.1)");
    this.roundRect(x + 16, fieldY, w - 16 - 8 - 40 - 8 - 16, 46, 12);
    ctx.strokeStyle = "rgba(255,255,255,0.15)";
    ctx.lineWidth = 1;
    ctx.stroke();
    this.font(400, 14);
    ctx.fillStyle = "rgba(255,255,255,0.4)";
    ctx.textBaseline = "middle";
    ctx.fillText("Send a message...", x + 32, fieldY + 23);
    this.drawIcon("send", x + w - 16 - 20, fieldY + 23, 20, "rgba(255,255,255,0.15)");
  }

  private drawParticipantsPanel(x: number, y: number, w: number, h: number, s: CompositorState) {
    const ctx = this.ctx;
    const list = Object.values(s.participants);
    let top = this.drawPanelShell(x, y, w, h, `People (${list.length + 1})`);

    ctx.textBaseline = "middle";
    this.font(700, 10);
    ctx.fillStyle = "rgba(255,255,255,0.25)";
    ctx.letterSpacing = "1.5px";
    ctx.fillText("IN CALL", x + 20, top + 8);
    ctx.letterSpacing = "0px";
    top += 16 + 8;

    const rows = [
      { name: `${s.displayName || "You"} (you)`, plain: s.displayName || "You", micOn: s.micOn, cameraOn: s.cameraOn },
      ...list.map((p) => ({ name: p.full_name, plain: p.full_name, micOn: p.micOn !== false, cameraOn: p.cameraOn !== false })),
    ];

    for (const row of rows) {
      if (top + 60 > y + h) break;
      const color = pickColor(PANEL_COLORS, row.plain);
      const avatarX = x + 12 + 12;
      this.fillRoundRect(avatarX, top + 12, 36, 36, 12, this.diagonalGradient(avatarX, top + 12, 36, 36, [
        [0, color],
        [1, `${color}aa`],
      ]));
      this.font(700, 12);
      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "center";
      ctx.fillText(panelInitials(row.plain), avatarX + 18, top + 30);
      ctx.textAlign = "left";

      let iconRight = x + w - 12 - 12;
      const micColor = row.micOn ? "rgba(255,255,255,0.2)" : "#ea4335";
      this.drawIcon(row.micOn ? "mic" : "micOff", iconRight - 8, top + 30, 16, micColor);
      iconRight -= 16 + 12;
      if (!row.cameraOn) {
        this.drawIcon("videocamOff", iconRight - 8, top + 30, 16, "rgba(255,255,255,0.3)");
        iconRight -= 16 + 12;
      }

      this.font(500, 14);
      ctx.fillStyle = "rgba(255,255,255,0.8)";
      ctx.fillText(this.truncate(row.name, iconRight - (avatarX + 36 + 12)), avatarX + 36 + 12, top + 30);
      top += 60;
    }
  }

  private drawTranscriptPanel(x: number, y: number, w: number, h: number, s: CompositorState) {
    const ctx = this.ctx;
    const contentTop = this.drawPanelShell(x, y, w, h, "Transcript");
    const entries = s.transcriptEntries;

    if (entries.length === 0) {
      this.drawEmptyState(x, contentTop, w, "transcript", "No speech transcribed yet", "Will appear as people speak");
      return;
    }

    const textW = w - 40;
    this.font(400, 14);
    const blocks = entries.map((e) => ({ entry: e, lines: this.wrap(e.text, textW) }));
    const heights = blocks.map((b) => 16 + 4 + b.lines.length * 23 + 16);
    const totalH = heights.reduce((sum, bh) => sum + bh, 0);

    ctx.save();
    ctx.beginPath();
    ctx.rect(x, contentTop, w, y + h - contentTop);
    ctx.clip();

    let top = totalH <= y + h - contentTop ? contentTop : y + h - totalH;
    for (let i = 0; i < blocks.length; i++) {
      const { entry, lines } = blocks[i];
      ctx.textBaseline = "middle";
      const color = pickColor(PANEL_COLORS, entry.speaker_name);
      this.font(700, 12);
      ctx.fillStyle = color;
      ctx.fillText(entry.speaker_name, x + 20, top + 8);
      let cx = x + 20 + ctx.measureText(entry.speaker_name).width + 8;

      const time = new Date(entry.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      this.font(400, 10);
      ctx.fillStyle = "rgba(255,255,255,0.2)";
      ctx.fillText(time, cx, top + 8);
      cx += ctx.measureText(time).width + 8;

      const lang = entry.lang.toUpperCase();
      const chipW = this.textWidth(lang, 600, 10) + 12;
      this.fillRoundRect(cx, top, chipW, 16, 6, "rgba(255,255,255,0.08)");
      this.font(600, 10);
      ctx.fillStyle = "rgba(255,255,255,0.3)";
      ctx.fillText(lang, cx + 6, top + 8);

      this.font(400, 14);
      ctx.fillStyle = "rgba(255,255,255,0.7)";
      lines.forEach((line, li) => ctx.fillText(line, x + 20, top + 16 + 4 + li * 23 + 11));
      top += heights[i];
    }
    ctx.restore();
  }

  private drawQueuePanel(x: number, y: number, w: number, h: number, s: CompositorState) {
    const ctx = this.ctx;
    let top = this.drawPanelShell(x, y, w, h, "Patient queue");
    const active = s.queue.find((q) => q.status === "active") ?? null;
    const waiting = s.queue.filter((q) => q.status === "waiting");
    ctx.textBaseline = "middle";

    if (active) {
      const cardH = 120;
      this.fillRoundRect(x + 20, top, w - 40, cardH, 16, "rgba(15,157,88,0.15)");
      this.font(600, 12);
      ctx.fillStyle = "#81c995";
      ctx.letterSpacing = "0.6px";
      ctx.fillText("CURRENT PATIENT", x + 36, top + 16 + 8);
      ctx.letterSpacing = "0px";
      this.font(600, 14);
      ctx.fillStyle = "#ffffff";
      ctx.fillText(this.truncate(active.patient_name, w - 72), x + 36, top + 16 + 16 + 4 + 10);
      const btnY = top + 16 + 20 + 4 + 12 + 8;
      this.fillRoundRect(x + 36, btnY, w - 72, 40, 12, "#ea4335");
      this.font(600, 14);
      ctx.textAlign = "center";
      ctx.fillStyle = "#ffffff";
      ctx.fillText("Complete consultation", x + w / 2, btnY + 20);
      ctx.textAlign = "left";
      top += cardH + 20;
    }

    if (waiting.length === 0) {
      this.font(400, 14);
      ctx.fillStyle = "rgba(255,255,255,0.3)";
      ctx.textAlign = "center";
      ctx.fillText("No patients waiting", x + w / 2, top + 24 + 10);
      ctx.textAlign = "left";
      return;
    }

    for (const session of waiting) {
      if (top + 60 > y + h) break;
      this.fillRoundRect(x + 20, top, w - 40, 60, 16, "rgba(255,255,255,0.05)");
      this.font(600, 14);
      ctx.fillStyle = "#ffffff";
      ctx.fillText(this.truncate(session.patient_name, w - 160), x + 36, top + 12 + 10);
      this.font(400, 12);
      ctx.fillStyle = "rgba(255,255,255,0.4)";
      ctx.fillText(`Waiting #${session.queue_position ?? "-"}`, x + 36, top + 12 + 20 + 8);

      const btnW = this.textWidth("Admit", 600, 12) + 32;
      const btnX = x + w - 36 - btnW;
      this.fillRoundRect(btnX, top + 14, btnW, 32, 12, this.diagonalGradient(btnX, top + 14, btnW, 32, [
        [0, "#4285f4"],
        [0.5, "#34a0f4"],
        [1, "#00c4cc"],
      ]));
      this.font(600, 12);
      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "center";
      ctx.fillText("Admit", btnX + btnW / 2, top + 30);
      ctx.textAlign = "left";
      top += 60 + 12;
    }
  }

  // ---------- toolbar ----------

  private drawCircleButton(cx: number, cy: number, icon: string, opts: { off?: boolean; active?: boolean; badge?: string; spinner?: boolean }) {
    const ctx = this.ctx;
    const r = 24;
    if (opts.off) {
      ctx.save();
      ctx.shadowColor = "rgba(239,68,68,0.3)";
      ctx.shadowBlur = 16;
      ctx.shadowOffsetY = 4;
      this.fillCircle(cx, cy, r, this.diagonalGradient(cx - r, cy - r, r * 2, r * 2, [
        [0, "#ea4335"],
        [1, "#ff6b6b"],
      ]));
      ctx.restore();
    } else if (opts.active) {
      this.fillCircle(cx, cy, r, "rgba(66,133,244,0.25)");
      ctx.beginPath();
      ctx.arc(cx, cy, r - 0.5, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(66,133,244,0.3)";
      ctx.lineWidth = 1;
      ctx.stroke();
    } else {
      this.fillCircle(cx, cy, r, "rgba(255,255,255,0.1)");
    }

    if (opts.spinner) {
      const spin = (performance.now() / 800) * Math.PI * 2;
      ctx.strokeStyle = "rgba(255,255,255,0.25)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, 8, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(cx, cy, 8, spin, spin + Math.PI / 2);
      ctx.stroke();
    } else {
      this.drawIcon(icon, cx, cy, 20, opts.active ? "#8ab4f8" : "#ffffff");
    }

    if (opts.badge) {
      const bw = Math.max(20, this.textWidth(opts.badge, 700, 10) + 8);
      const bx = cx + r - bw + 4;
      const by = cy - r - 4;
      this.fillRoundRect(bx, by, bw, 20, 10, "#4285f4");
      this.font(700, 10);
      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(opts.badge, bx + bw / 2, by + 10);
      ctx.textAlign = "left";
    }
  }

  private leaveButtonWidth(): number {
    return 64 + 20 + 8 + this.textWidth("Leave", 500, 14);
  }

  private centerClusterX(s: CompositorState): number {
    const rightCount = s.showQueue ? 3 : 2;
    const rightW = rightCount * 48 + (rightCount - 1) * 8;
    const regionStart = 16 + 100;
    const regionEnd = W - 16 - rightW;
    const clusterW = 5 * 48 + 5 * 12 + this.leaveButtonWidth();
    return (regionStart + regionEnd) / 2 - clusterW / 2;
  }

  private drawToolbar(s: CompositorState) {
    const ctx = this.ctx;
    const top = H - TOOLBAR_H;
    ctx.fillStyle = "rgba(15,12,41,0.7)";
    ctx.fillRect(0, top, W, TOOLBAR_H);
    const cy = top + TOOLBAR_H / 2;

    let x = this.centerClusterX(s);
    this.drawCircleButton(x + 24, cy, s.micOn ? "mic" : "micOff", { off: !s.micOn, spinner: s.micConnecting });
    x += 60;
    this.drawCircleButton(x + 24, cy, s.cameraOn ? "videocam" : "videocamOff", { off: !s.cameraOn });
    x += 60;
    this.drawCircleButton(x + 24, cy, "captions", { active: s.captionsOn });
    x += 60;
    this.drawCircleButton(x + 24, cy, s.screenSharing ? "stopScreenShare" : "screenShare", { active: s.screenSharing });
    x += 60;
    this.drawCircleButton(x + 24, cy, "moreVert", { active: s.moreMenuOpen });
    x += 60;

    const leaveW = this.leaveButtonWidth();
    ctx.save();
    ctx.shadowColor = "rgba(234,67,53,0.3)";
    ctx.shadowBlur = 16;
    ctx.shadowOffsetY = 4;
    this.fillRoundRect(x, cy - 24, leaveW, 48, 24, this.diagonalGradient(x, cy - 24, leaveW, 48, [
      [0, "#ea4335"],
      [1, "#ff6b6b"],
    ]));
    ctx.restore();
    this.drawIcon("callEnd", x + 32 + 10, cy, 20, "#ffffff");
    this.font(500, 14);
    ctx.fillStyle = "#ffffff";
    ctx.textBaseline = "middle";
    ctx.fillText("Leave", x + 32 + 20 + 8, cy);

    let right = W - 16 - 24;
    this.drawCircleButton(right, cy, "chat", { active: s.chatOpen });
    right -= 56;
    this.drawCircleButton(right, cy, "people", { active: s.participantsOpen, badge: String(Object.keys(s.participants).length + 1) });
    right -= 56;
    if (s.showQueue) {
      const waitingCount = s.queue.filter((q) => q.status === "waiting").length;
      this.drawCircleButton(right, cy, "queue", { active: s.queueOpen, badge: waitingCount > 0 ? String(waitingCount) : undefined });
    }
  }

  private drawMoreMenu(s: CompositorState) {
    const ctx = this.ctx;
    const w = 260;
    const h = 217;
    const moreCx = this.centerClusterX(s) + 4 * 60 + 24;
    const x = moreCx - w / 2;
    const bottom = H - TOOLBAR_H + 12 + 48 - 64;
    const y = bottom - h;

    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.45)";
    ctx.shadowBlur = 40;
    ctx.shadowOffsetY = 12;
    this.fillRoundRect(x, y, w, h, 16, "rgba(30,30,46,0.95)");
    ctx.restore();

    ctx.textBaseline = "middle";
    let top = y + 8;

    this.drawIcon("captions", x + 20 + 10, top + 30, 20, "#8ab4f8");
    this.font(500, 14);
    ctx.fillStyle = "#ffffff";
    ctx.fillText("Caption mode", x + 52, top + 22);
    this.font(400, 12);
    ctx.fillStyle = "rgba(255,255,255,0.4)";
    ctx.fillText(s.showOriginalCaptions ? "Showing original" : "Showing translated", x + 52, top + 42);
    top += 60;

    this.drawIcon("transcript", x + 20 + 10, top + 22, 20, "#8ab4f8");
    this.font(500, 14);
    ctx.fillStyle = "#ffffff";
    ctx.fillText("Transcript", x + 52, top + 22);
    top += 44;

    this.drawIcon("summary", x + 20 + 10, top + 22, 20, "#8ab4f8");
    this.font(500, 14);
    ctx.fillStyle = "#ffffff";
    ctx.fillText("Meeting summary", x + 52, top + 22);
    top += 44;

    ctx.fillStyle = "rgba(255,255,255,0.08)";
    ctx.fillRect(x + 16, top + 4, w - 32, 1);
    top += 9;

    this.drawIcon("stop", x + 20 + 10, top + 22, 20, "#ea4335");
    this.font(500, 14);
    ctx.fillStyle = "#ffffff";
    ctx.fillText("Stop recording", x + 52, top + 22);
    const pulse = 0.55 + 0.45 * Math.abs(Math.sin(performance.now() / 1000));
    ctx.globalAlpha = pulse;
    this.fillCircle(x + w - 20 - 5, top + 22, 5, "#ea4335");
    ctx.globalAlpha = 1;
  }
}
