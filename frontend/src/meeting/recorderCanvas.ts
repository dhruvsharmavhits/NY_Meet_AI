import type { Caption, ChatMessage, Participant } from "@/meeting/types";

export interface RecorderQueueEntry {
  patient_name: string;
  status: string;
  queue_position?: number | null;
}

export interface RecorderTranscriptEntry {
  speaker_name: string;
  text: string;
  lang: string;
}

export interface CamTile {
  key: string;
  name: string;
  video: HTMLVideoElement;
  cameraOn: boolean;
  micOn: boolean;
  isLocal: boolean;
}

export interface ScreenTile {
  key: string;
  name: string;
  video: HTMLVideoElement;
}

export interface RecorderUiState {
  localName: string;
  roomCode: string;
  micOn: boolean;
  cameraOn: boolean;
  screenSharing: boolean;
  captionsOn: boolean;
  captions: Caption[];
  myLanguage: string;
  showOriginalCaptions: boolean;
  captionPosition: "top" | "bottom";
  captionFontSize: number;
  connected: boolean;
  reconnecting: boolean;
  elapsed: number;
  chatOpen: boolean;
  messages: ChatMessage[];
  participantsOpen: boolean;
  participants: Record<string, Participant>;
  transcriptOpen: boolean;
  transcript: RecorderTranscriptEntry[];
  showQueue: boolean;
  queueOpen: boolean;
  queue: RecorderQueueEntry[];
}

export interface FrameInput {
  ui: RecorderUiState;
  camTiles: CamTile[];
  pinnedScreen: ScreenTile | null;
}

const HEADER_H = 52;
const TOOLBAR_H = 72;
const PANEL_BORDER = "rgba(255,255,255,0.06)";
const PANEL_BG = "rgba(15, 12, 41, 0.92)";

const TILE_COLORS = [
  "#7c3aed", "#4285f4", "#f97316", "#0f9d58", "#ea4335",
  "#2563eb", "#d946ef", "#059669", "#e11d48", "#8b5cf6",
];
const PANEL_COLORS = [
  "#c084fc", "#60a5fa", "#fb923c", "#34d399", "#f87171",
  "#818cf8", "#fbbf24", "#a78bfa", "#f472b6", "#22d3ee",
];
const CAPTION_COLORS = [
  "#c58af9", "#8ab4f8", "#fcad70", "#81c995", "#f28b82",
  "#78d9ec", "#fdd663", "#a8dab5", "#f6aea9", "#b39ddb",
];

function hashOf(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return Math.abs(hash);
}

const tileColor = (n: string) => TILE_COLORS[hashOf(n) % TILE_COLORS.length];
const panelColor = (n: string) => PANEL_COLORS[hashOf(n) % PANEL_COLORS.length];
const captionColor = (n: string) => CAPTION_COLORS[hashOf(n) % CAPTION_COLORS.length];

function initialsFor(name: string): string {
  const cleaned = name.replace(/\s*\(you\)\s*$/i, "").trim();
  if (!cleaned) return "?";
  const parts = cleaned.split(/\s+/);
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

const ICONS = {
  mic: "M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zM17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z",
  micOff: "M19 11h-1.7c0 .74-.16 1.43-.43 2.05l1.23 1.23c.56-.98.9-2.09.9-3.28zm-4.02.17c0-.06.02-.11.02-.17V5c0-1.66-1.34-3-3-3S9 3.34 9 5v.18l5.98 5.99zM4.27 3L3 4.27l6.01 6.01V11c0 1.66 1.33 3 2.99 3 .22 0 .44-.03.65-.08l1.66 1.66c-.71.33-1.5.52-2.31.52-2.76 0-5.3-2.1-5.3-5.1H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c.91-.13 1.77-.45 2.54-.9L19.73 21 21 19.73 4.27 3z",
  cam: "M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z",
  camOff: "M21 6.5l-4 4V7c0-.55-.45-1-1-1H9.82L21 17.18V6.5zM3.27 2L2 3.27 4.73 6H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.21 0 .39-.08.54-.18L19.73 21 21 19.73 3.27 2z",
  captions: "M19 4H5c-1.11 0-2 .9-2 2v12c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm-8 7H9.5v-.5h-2v3h2V13H11v1c0 .55-.45 1-1 1H7c-.55 0-1-.45-1-1v-4c0-.55.45-1 1-1h3c.55 0 1 .45 1 1v1zm7 0h-1.5v-.5h-2v3h2V13H18v1c0 .55-.45 1-1 1h-3c-.55 0-1-.45-1-1v-4c0-.55.45-1 1-1h3c.55 0 1 .45 1 1v1z",
  share: "M20 18c1.1 0 1.99-.9 1.99-2L22 6c0-1.11-.9-2-2-2H4c-1.11 0-2 .89-2 2v10c0 1.1.89 2 2 2H0v2h24v-2h-4zm-7-3.53v-2.19c-2.78 0-4.61.85-6 2.72.56-2.67 2.11-5.33 6-5.87V7l4 3.73-4 3.74z",
  stopShare: "M21.22 18.02l2 2H24v-2h-2.78zM1.22 2L0 3.22l1 1V18c0 1.1.89 2 2 2h12l2 2h3.78l1 1L23 21.78 1.22 2zM7 15c0-1.57.75-2.96 1.91-3.83L14 16.27c-.71.5-1.47.73-2 .73-2.21 0-4-1.79-4-4v2zm14-9H7.66l6.52 6.52c2.04-.37 3.6-1.77 4.32-3.52H20v-1h-1.34c-.12-.34-.28-.67-.46-.98L22 3.22 20.78 2 18.02 4.76C17.4 4.29 16.72 4 16 4H5.22l2 2H20v10.78l1-1V6z",
  more: "M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z",
  callEnd: "M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08c-.18-.17-.29-.42-.29-.7 0-.28.11-.53.29-.71C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67c.18.18.29.43.29.71 0 .28-.11.53-.29.71l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.11-.7-.28-.79-.74-1.69-1.36-2.67-1.85-.33-.16-.56-.5-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z",
  chat: "M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z",
  people: "M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z",
  queue: "M4 6h16v2H4V6zm0 5h16v2H4v-2zm0 5h10v2H4v-2z",
  transcript: "M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z",
  close: "M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z",
} as const;

const pathCache = new Map<string, Path2D>();
function pathFor(d: string): Path2D {
  let p = pathCache.get(d);
  if (!p) {
    p = new Path2D(d);
    pathCache.set(d, p);
  }
  return p;
}

function drawIcon(ctx: CanvasRenderingContext2D, d: string, cx: number, cy: number, size: number, color: string) {
  const scale = size / 24;
  ctx.save();
  ctx.translate(cx - size / 2, cy - size / 2);
  ctx.scale(scale, scale);
  ctx.fillStyle = color;
  ctx.fill(pathFor(d));
  ctx.restore();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function truncate(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + "…").width > maxWidth) t = t.slice(0, -1);
  return t + "…";
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > maxWidth && line) {
      lines.push(line);
      line = word;
      if (lines.length === maxLines) return lines;
    } else {
      line = next;
    }
  }
  if (line && lines.length < maxLines) lines.push(line);
  return lines;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, "0");
  const s = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

// Mirrors VideoTile: rounded-2xl tile, object-contain video (mirrored for the
// local preview), avatar + initials when the camera is off, bottom gradient
// bar with the mic-off badge and the name.
function drawVideoTile(
  ctx: CanvasRenderingContext2D,
  tile: { name: string; video: HTMLVideoElement | null; cameraOn: boolean; micOn: boolean; isLocal: boolean; isScreen?: boolean },
  x: number,
  y: number,
  w: number,
  h: number
) {
  if (w <= 2 || h <= 2) return;
  const radius = Math.min(16, w / 4, h / 4);
  ctx.save();
  roundRect(ctx, x, y, w, h, radius);
  ctx.clip();

  ctx.fillStyle = "#1e1e2e";
  ctx.fillRect(x, y, w, h);

  const v = tile.video;
  const hasFrame = !!v && v.readyState >= 2 && v.videoWidth > 0 && (tile.isScreen || tile.cameraOn);

  if (hasFrame && v) {
    const scale = Math.min(w / v.videoWidth, h / v.videoHeight);
    const dw = v.videoWidth * scale;
    const dh = v.videoHeight * scale;
    const dx = x + (w - dw) / 2;
    const dy = y + (h - dh) / 2;
    if (tile.isLocal) {
      ctx.save();
      ctx.translate(dx + dw, dy);
      ctx.scale(-1, 1);
      ctx.drawImage(v, 0, 0, dw, dh);
      ctx.restore();
    } else {
      ctx.drawImage(v, dx, dy, dw, dh);
    }
  } else if (!tile.isScreen) {
    const color = tileColor(tile.name);
    const grad = ctx.createLinearGradient(x, y, x + w, y + h);
    grad.addColorStop(0, `${color}22`);
    grad.addColorStop(1, `${color}11`);
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, w, h);

    const r = Math.max(14, Math.min(48, Math.min(w, h) * 0.22));
    ctx.beginPath();
    ctx.arc(x + w / 2, y + h / 2, r, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = `600 ${Math.round(r * 0.78)}px system-ui, -apple-system, "Segoe UI", sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(initialsFor(tile.name), x + w / 2, y + h / 2 + 1);
  }

  const barH = Math.min(56, Math.max(30, h * 0.18));
  const barGrad = ctx.createLinearGradient(0, y + h - barH, 0, y + h);
  barGrad.addColorStop(0, "rgba(0,0,0,0)");
  barGrad.addColorStop(0.55, "rgba(0,0,0,0.3)");
  barGrad.addColorStop(1, "rgba(0,0,0,0.7)");
  ctx.fillStyle = barGrad;
  ctx.fillRect(x, y + h - barH, w, barH);

  const compact = h < 150;
  const padX = compact ? 8 : 16;
  const labelY = y + h - (compact ? 14 : 20);
  let textX = x + padX;

  if (!tile.micOn && !tile.isScreen) {
    const badgeR = compact ? 9 : 14;
    ctx.beginPath();
    ctx.arc(textX + badgeR, labelY, badgeR, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(234,67,53,0.9)";
    ctx.fill();
    drawIcon(ctx, ICONS.micOff, textX + badgeR, labelY, compact ? 11 : 14, "#fff");
    textX += badgeR * 2 + 8;
  }

  ctx.fillStyle = "#fff";
  ctx.font = `500 ${compact ? 11 : 14}px system-ui, -apple-system, "Segoe UI", sans-serif`;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(truncate(ctx, tile.name, x + w - padX - textX), textX, labelY);

  ctx.restore();
}

// Mirrors VideoGrid: screen share pins as the main tile with everyone in a
// filmstrip beside it, otherwise a responsive equal grid.
function drawVideoArea(ctx: CanvasRenderingContext2D, input: FrameInput, x: number, y: number, w: number, h: number) {
  const { camTiles, pinnedScreen, ui } = input;
  const pad = 12;
  const gap = 8;

  const tiles = camTiles.map((t) => ({
    name: t.isLocal ? `${t.name} (you)` : t.name,
    video: t.video,
    cameraOn: t.cameraOn,
    micOn: t.micOn,
    isLocal: t.isLocal,
  }));

  if (pinnedScreen) {
    const stripW = Math.min(220, Math.max(140, w * 0.2));
    const mainW = w - pad * 2 - stripW - gap;
    const mainH = h - pad * 2;
    drawVideoTile(
      ctx,
      { name: pinnedScreen.name, video: pinnedScreen.video, cameraOn: true, micOn: true, isLocal: false, isScreen: true },
      x + pad,
      y + pad,
      mainW,
      mainH
    );

    const stripX = x + pad + mainW + gap;
    const tileH = 128;
    tiles.forEach((t, i) => {
      const ty = y + pad + i * (tileH + gap);
      if (ty + tileH > y + h - pad) return;
      drawVideoTile(ctx, t, stripX, ty, stripW, tileH);
    });
    return;
  }

  const total = Math.max(tiles.length, 1);
  const cols = total === 1 ? 1 : total === 2 ? 2 : total <= 4 ? 2 : total <= 6 ? 3 : 4;
  const rows = Math.ceil(total / cols);
  const cellW = (w - pad * 2 - gap * (cols - 1)) / cols;
  const cellH = (h - pad * 2 - gap * (rows - 1)) / rows;

  tiles.forEach((t, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    drawVideoTile(ctx, t, x + pad + col * (cellW + gap), y + pad + row * (cellH + gap), cellW, cellH);
  });

  if (tiles.length === 0) {
    ctx.fillStyle = "rgba(255,255,255,0.25)";
    ctx.font = "14px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(ui.localName, x + w / 2, y + h / 2);
  }
}

function drawHeader(ctx: CanvasRenderingContext2D, ui: RecorderUiState, w: number) {
  ctx.fillStyle = "rgba(15,12,41,0.5)";
  ctx.fillRect(0, 0, w, HEADER_H);

  const cy = HEADER_H / 2;
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";

  let x = 16;
  ctx.fillStyle = "rgba(255,255,255,0.6)";
  ctx.font = "500 14px system-ui, -apple-system, sans-serif";
  const time = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  ctx.fillText(time, x, cy);
  x += ctx.measureText(time).width + 12;

  ctx.font = "600 12px system-ui, -apple-system, sans-serif";
  const codeW = ctx.measureText(ui.roomCode).width + 28;
  ctx.fillStyle = "rgba(255,255,255,0.08)";
  roundRect(ctx, x, cy - 14, codeW, 28, 12);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.8)";
  ctx.fillText(ui.roomCode, x + 14, cy);
  x += codeW + 12;

  ctx.fillStyle = "rgba(234,67,53,0.15)";
  roundRect(ctx, x, cy - 14, 72, 28, 12);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x + 16, cy, 4, 0, Math.PI * 2);
  ctx.fillStyle = "#ea4335";
  ctx.fill();
  ctx.fillStyle = "#ff6b6b";
  ctx.font = "700 12px system-ui, sans-serif";
  ctx.fillText("REC", x + 26, cy);

  let rx = w - 16;
  const avatarSize = 36;
  const avGrad = ctx.createLinearGradient(rx - avatarSize, cy - 18, rx, cy + 18);
  avGrad.addColorStop(0, "#7c3aed");
  avGrad.addColorStop(1, "#4285f4");
  ctx.fillStyle = avGrad;
  roundRect(ctx, rx - avatarSize, cy - avatarSize / 2, avatarSize, avatarSize, 12);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.font = "700 13px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText((ui.localName || "U").charAt(0).toUpperCase(), rx - avatarSize / 2, cy + 1);
  rx -= avatarSize + 12;

  ctx.textAlign = "right";
  ctx.fillStyle = "rgba(255,255,255,0.4)";
  ctx.font = "500 12px system-ui, sans-serif";
  ctx.fillText(formatDuration(ui.elapsed), rx, cy);
  rx -= ctx.measureText(formatDuration(ui.elapsed)).width + 12;

  if (!ui.connected) {
    const text = ui.reconnecting ? "Reconnecting..." : "Connecting...";
    ctx.font = "500 12px system-ui, sans-serif";
    const tw = ctx.measureText(text).width + 36;
    ctx.fillStyle = "rgba(244,180,0,0.15)";
    roundRect(ctx, rx - tw, cy - 14, tw, 28, 12);
    ctx.fill();
    ctx.fillStyle = "#fbbf24";
    ctx.textAlign = "right";
    ctx.fillText(text, rx - 14, cy);
  }
}

// Mirrors Toolbar: 48px round buttons, red when off, blue-tinted when active,
// wide gradient Leave pill, right-aligned panel toggles with badges.
function drawToolbar(ctx: CanvasRenderingContext2D, ui: RecorderUiState, w: number, h: number) {
  const top = h - TOOLBAR_H;
  ctx.fillStyle = "rgba(15, 12, 41, 0.7)";
  ctx.fillRect(0, top, w, TOOLBAR_H);
  ctx.fillStyle = PANEL_BORDER;
  ctx.fillRect(0, top, w, 1);

  const cy = top + TOOLBAR_H / 2;
  const size = 48;
  const gap = 12;

  function button(cx: number, icon: string, state: { off?: boolean; active?: boolean }) {
    ctx.beginPath();
    ctx.arc(cx, cy, size / 2, 0, Math.PI * 2);
    if (state.off) {
      const g = ctx.createLinearGradient(cx - 24, cy - 24, cx + 24, cy + 24);
      g.addColorStop(0, "#ea4335");
      g.addColorStop(1, "#ff6b6b");
      ctx.fillStyle = g;
    } else if (state.active) {
      ctx.fillStyle = "rgba(66,133,244,0.25)";
    } else {
      ctx.fillStyle = "rgba(255,255,255,0.1)";
    }
    ctx.fill();
    if (state.active && !state.off) {
      ctx.strokeStyle = "rgba(66,133,244,0.3)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    drawIcon(ctx, icon, cx, cy, 20, state.active && !state.off ? "#8ab4f8" : "#fff");
  }

  function badge(cx: number, value: number) {
    if (!value) return;
    const bx = cx + size / 2 - 2;
    const by = cy - size / 2 + 2;
    ctx.font = "700 10px system-ui, sans-serif";
    const text = String(value);
    const bw = Math.max(20, ctx.measureText(text).width + 10);
    ctx.fillStyle = "#4285f4";
    roundRect(ctx, bx - bw / 2, by - 10, bw, 20, 10);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, bx, by + 1);
  }

  const leaveW = 132;
  const centerCount = 5;
  const centerWidth = centerCount * size + centerCount * gap + leaveW;
  let cx = w / 2 - centerWidth / 2 + size / 2;

  button(cx, ui.micOn ? ICONS.mic : ICONS.micOff, { off: !ui.micOn });
  cx += size + gap;
  button(cx, ui.cameraOn ? ICONS.cam : ICONS.camOff, { off: !ui.cameraOn });
  cx += size + gap;
  button(cx, ICONS.captions, { active: ui.captionsOn });
  cx += size + gap;
  button(cx, ui.screenSharing ? ICONS.stopShare : ICONS.share, { active: ui.screenSharing });
  cx += size + gap;
  button(cx, ICONS.more, {});
  cx += size / 2 + gap;

  const lg = ctx.createLinearGradient(cx, cy - 24, cx + leaveW, cy + 24);
  lg.addColorStop(0, "#ea4335");
  lg.addColorStop(1, "#ff6b6b");
  ctx.fillStyle = lg;
  roundRect(ctx, cx, cy - size / 2, leaveW, size, size / 2);
  ctx.fill();
  drawIcon(ctx, ICONS.callEnd, cx + 40, cy, 20, "#fff");
  ctx.fillStyle = "#fff";
  ctx.font = "500 14px system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText("Leave", cx + 56, cy + 1);

  let rx = w - 16 - size / 2;
  button(rx, ICONS.chat, { active: ui.chatOpen });
  rx -= size + 8;
  const people = Object.keys(ui.participants).length + 1;
  button(rx, ICONS.people, { active: ui.participantsOpen });
  badge(rx, people);
  rx -= size + 8;
  if (ui.showQueue) {
    button(rx, ICONS.queue, { active: ui.queueOpen });
    badge(rx, ui.queue.filter((q) => q.status === "waiting").length);
  }
}

function drawPanelShell(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, title: string) {
  ctx.fillStyle = PANEL_BG;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = PANEL_BORDER;
  ctx.fillRect(x, y, 1, h);

  ctx.fillStyle = "#fff";
  ctx.font = "700 16px system-ui, -apple-system, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(title, x + 20, y + 30);
  drawIcon(ctx, ICONS.close, x + w - 34, y + 30, 18, "rgba(255,255,255,0.5)");
}

function drawChatPanel(ctx: CanvasRenderingContext2D, ui: RecorderUiState, x: number, y: number, w: number, h: number) {
  drawPanelShell(ctx, x, y, w, h, "Chat");

  const inputTop = y + h - 62;
  ctx.fillStyle = "rgba(255,255,255,0.08)";
  ctx.fillRect(x, inputTop, w, 1);
  ctx.fillStyle = "rgba(255,255,255,0.1)";
  roundRect(ctx, x + 16, inputTop + 12, w - 74, 38, 12);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.15)";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = "rgba(255,255,255,0.4)";
  ctx.font = "14px system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText("Send a message...", x + 32, inputTop + 31);

  const bodyTop = y + 60;
  const bodyBottom = inputTop - 8;

  if (ui.messages.length === 0) {
    ctx.fillStyle = "rgba(255,255,255,0.3)";
    ctx.font = "14px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Messages are visible to everyone in the call", x + w / 2, bodyTop + 80);
    return;
  }

  const entries: { name: string; lines: string[] }[] = [];
  ctx.font = "14px system-ui, sans-serif";
  for (const m of ui.messages) entries.push({ name: m.full_name, lines: wrapLines(ctx, m.text, w - 72, 3) });

  let totalH = 0;
  const heights = entries.map((e) => 26 + e.lines.length * 19 + 10);
  for (let i = entries.length - 1; i >= 0; i--) {
    if (totalH + heights[i] > bodyBottom - bodyTop) {
      entries.splice(0, i + 1);
      heights.splice(0, i + 1);
      break;
    }
    totalH += heights[i];
  }

  let cy = bodyTop;
  entries.forEach((entry, i) => {
    const color = panelColor(entry.name);
    ctx.fillStyle = color;
    roundRect(ctx, x + 20, cy, 24, 24, 8);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = "700 9px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(initialsFor(entry.name), x + 32, cy + 13);

    ctx.textAlign = "left";
    ctx.fillStyle = color;
    ctx.font = "600 12px system-ui, sans-serif";
    ctx.fillText(truncate(ctx, entry.name, w - 80), x + 52, cy + 12);

    ctx.fillStyle = "rgba(255,255,255,0.8)";
    ctx.font = "14px system-ui, sans-serif";
    entry.lines.forEach((line, li) => ctx.fillText(line, x + 52, cy + 34 + li * 19));
    cy += heights[i];
  });
}

function drawParticipantsPanel(ctx: CanvasRenderingContext2D, ui: RecorderUiState, x: number, y: number, w: number, h: number) {
  const list = Object.values(ui.participants);
  drawPanelShell(ctx, x, y, w, h, `People (${list.length + 1})`);

  ctx.fillStyle = "rgba(255,255,255,0.25)";
  ctx.font = "700 10px system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText("IN CALL", x + 20, y + 62);

  const rows = [
    { name: `${ui.localName} (you)`, micOn: ui.micOn, cameraOn: ui.cameraOn },
    ...list.map((p) => ({ name: p.full_name, micOn: p.micOn !== false, cameraOn: p.cameraOn !== false })),
  ];

  rows.forEach((p, i) => {
    const rowY = y + 82 + i * 54;
    if (rowY + 40 > y + h) return;
    const color = panelColor(p.name);
    const g = ctx.createLinearGradient(x + 20, rowY, x + 56, rowY + 36);
    g.addColorStop(0, color);
    g.addColorStop(1, `${color}aa`);
    ctx.fillStyle = g;
    roundRect(ctx, x + 20, rowY, 36, 36, 12);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = "700 12px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(initialsFor(p.name), x + 38, rowY + 19);

    ctx.textAlign = "left";
    ctx.fillStyle = "rgba(255,255,255,0.8)";
    ctx.font = "500 14px system-ui, sans-serif";
    ctx.fillText(truncate(ctx, p.name, w - 130), x + 68, rowY + 19);

    let ix = x + w - 32;
    drawIcon(ctx, p.micOn ? ICONS.mic : ICONS.micOff, ix, rowY + 18, 16, p.micOn ? "rgba(255,255,255,0.2)" : "#ea4335");
    if (!p.cameraOn) {
      ix -= 24;
      drawIcon(ctx, ICONS.camOff, ix, rowY + 18, 16, "rgba(255,255,255,0.3)");
    }
  });
}

function drawTranscriptPanel(ctx: CanvasRenderingContext2D, ui: RecorderUiState, x: number, y: number, w: number, h: number) {
  drawPanelShell(ctx, x, y, w, h, "Transcript");

  if (ui.transcript.length === 0) {
    ctx.fillStyle = "rgba(255,255,255,0.3)";
    ctx.font = "14px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("No speech transcribed yet", x + w / 2, y + 140);
    return;
  }

  ctx.font = "14px system-ui, sans-serif";
  const entries = ui.transcript.map((e) => ({ ...e, lines: wrapLines(ctx, e.text, w - 48, 3) }));
  const heights = entries.map((e) => 20 + e.lines.length * 20 + 10);
  const bodyTop = y + 60;
  const bodyBottom = y + h - 16;

  let totalH = 0;
  for (let i = entries.length - 1; i >= 0; i--) {
    if (totalH + heights[i] > bodyBottom - bodyTop) {
      entries.splice(0, i + 1);
      heights.splice(0, i + 1);
      break;
    }
    totalH += heights[i];
  }

  let cy = bodyTop;
  entries.forEach((entry, i) => {
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillStyle = panelColor(entry.speaker_name);
    ctx.font = "700 12px system-ui, sans-serif";
    ctx.fillText(truncate(ctx, entry.speaker_name, w - 80), x + 20, cy + 8);

    ctx.fillStyle = "rgba(255,255,255,0.3)";
    ctx.font = "600 10px system-ui, sans-serif";
    ctx.fillText(entry.lang.toUpperCase(), x + 24 + ctx.measureText(entry.speaker_name).width + 40, cy + 8);

    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.font = "14px system-ui, sans-serif";
    entry.lines.forEach((line, li) => ctx.fillText(line, x + 20, cy + 30 + li * 20));
    cy += heights[i];
  });
}

function drawQueuePanel(ctx: CanvasRenderingContext2D, ui: RecorderUiState, x: number, y: number, w: number, h: number) {
  drawPanelShell(ctx, x, y, w, h, "Patient queue");

  const active = ui.queue.find((q) => q.status === "active");
  const waiting = ui.queue.filter((q) => q.status === "waiting");
  let cy = y + 62;

  ctx.textAlign = "left";
  ctx.textBaseline = "middle";

  if (active) {
    ctx.fillStyle = "rgba(15,157,88,0.15)";
    roundRect(ctx, x + 20, cy, w - 40, 104, 16);
    ctx.fill();
    ctx.fillStyle = "#81c995";
    ctx.font = "600 11px system-ui, sans-serif";
    ctx.fillText("CURRENT PATIENT", x + 36, cy + 22);
    ctx.fillStyle = "#fff";
    ctx.font = "600 14px system-ui, sans-serif";
    ctx.fillText(truncate(ctx, active.patient_name, w - 80), x + 36, cy + 44);
    ctx.fillStyle = "#ea4335";
    roundRect(ctx, x + 36, cy + 58, w - 72, 34, 12);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = "600 13px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Complete consultation", x + w / 2, cy + 76);
    ctx.textAlign = "left";
    cy += 120;
  }

  if (waiting.length === 0) {
    ctx.fillStyle = "rgba(255,255,255,0.3)";
    ctx.font = "14px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("No patients waiting", x + w / 2, cy + 24);
    return;
  }

  waiting.forEach((q) => {
    if (cy + 56 > y + h) return;
    ctx.fillStyle = "rgba(255,255,255,0.05)";
    roundRect(ctx, x + 20, cy, w - 40, 56, 16);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = "600 14px system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(truncate(ctx, q.patient_name, w - 140), x + 36, cy + 20);
    ctx.fillStyle = "rgba(255,255,255,0.4)";
    ctx.font = "12px system-ui, sans-serif";
    ctx.fillText(`Waiting #${q.queue_position ?? ""}`, x + 36, cy + 40);

    ctx.fillStyle = "#4285f4";
    roundRect(ctx, x + w - 96, cy + 14, 60, 28, 10);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = "600 12px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Admit", x + w - 66, cy + 29);
    cy += 64;
  });
}

// Mirrors CaptionOverlay: centered stack of pills over the content area.
function drawCaptions(ctx: CanvasRenderingContext2D, ui: RecorderUiState, x: number, y: number, w: number, h: number) {
  if (!ui.captionsOn || ui.captions.length === 0) return;
  const recent = ui.captions.slice(-3);
  const fs = ui.captionFontSize || 16;
  const lineH = fs + 20;
  const gap = 6;
  const blockH = recent.length * lineH + (recent.length - 1) * gap;
  const startY = ui.captionPosition === "top" ? y + 16 : y + h - 24 - blockH;

  recent.forEach((c, i) => {
    const translated = c.translations[ui.myLanguage];
    const text = ui.showOriginalCaptions || !translated ? c.text : translated;
    const lang = (ui.showOriginalCaptions || !translated ? c.lang : ui.myLanguage).toUpperCase();

    ctx.font = `500 ${fs}px system-ui, -apple-system, sans-serif`;
    const nameW = ctx.measureText(c.full_name).width;
    ctx.font = `${fs}px system-ui, -apple-system, sans-serif`;
    const maxTextW = w * 0.7 - nameW - 90;
    const shown = truncate(ctx, text, maxTextW);
    const textW = ctx.measureText(shown).width;
    const langW = 30;
    const boxW = nameW + textW + langW + 48;
    const bx = x + (w - boxW) / 2;
    const by = startY + i * (lineH + gap);

    ctx.fillStyle = "rgba(32,33,36,0.9)";
    roundRect(ctx, bx, by, boxW, lineH, 8);
    ctx.fill();

    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.fillStyle = captionColor(c.full_name);
    ctx.font = `500 ${fs}px system-ui, -apple-system, sans-serif`;
    ctx.fillText(c.full_name, bx + 16, by + lineH / 2);

    ctx.fillStyle = "#fff";
    ctx.font = `${fs}px system-ui, -apple-system, sans-serif`;
    ctx.fillText(shown, bx + 16 + nameW + 8, by + lineH / 2);

    ctx.fillStyle = "rgba(255,255,255,0.15)";
    roundRect(ctx, bx + boxW - 16 - langW, by + lineH / 2 - 9, langW, 18, 4);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.font = "500 10px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(lang, bx + boxW - 16 - langW / 2, by + lineH / 2 + 1);
  });
}

export function drawMeetingFrame(ctx: CanvasRenderingContext2D, w: number, h: number, input: FrameInput) {
  const { ui } = input;

  const bg = ctx.createLinearGradient(0, 0, w, h);
  bg.addColorStop(0, "#0f0c29");
  bg.addColorStop(0.5, "#1a1a2e");
  bg.addColorStop(1, "#16213e");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  const contentTop = HEADER_H;
  const contentH = h - HEADER_H - TOOLBAR_H;

  let panel: { width: number; draw: (x: number) => void } | null = null;
  if (ui.chatOpen) {
    panel = { width: 360, draw: (x) => drawChatPanel(ctx, ui, x, contentTop, 360, contentH) };
  } else if (ui.participantsOpen) {
    panel = { width: 320, draw: (x) => drawParticipantsPanel(ctx, ui, x, contentTop, 320, contentH) };
  } else if (ui.transcriptOpen) {
    panel = { width: 360, draw: (x) => drawTranscriptPanel(ctx, ui, x, contentTop, 360, contentH) };
  } else if (ui.showQueue && ui.queueOpen) {
    panel = { width: 360, draw: (x) => drawQueuePanel(ctx, ui, x, contentTop, 360, contentH) };
  }

  const panelW = panel?.width ?? 0;
  const videoW = w - panelW;

  drawVideoArea(ctx, input, 0, contentTop, videoW, contentH);
  drawCaptions(ctx, ui, 0, contentTop, videoW, contentH);
  panel?.draw(videoW);

  drawHeader(ctx, ui, w);
  drawToolbar(ctx, ui, w, h);
}
