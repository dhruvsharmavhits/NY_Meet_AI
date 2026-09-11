import { useCallback, useEffect, useRef, useState } from "react";
import type { Caption, ChatMessage, Participant } from "@/meeting/types";
import {
  drawMeetingFrame,
  type CamTile,
  type RecorderQueueEntry,
  type RecorderTranscriptEntry,
  type RecorderUiState,
  type ScreenTile,
} from "@/meeting/recorderCanvas";

interface UseRecorderOptions {
  localStream: MediaStream | null;
  remoteStreams: Record<string, MediaStream>;
  screenStream: MediaStream | null;
  remoteScreenStreams: Record<string, MediaStream>;
  localName: string;
  roomCode: string;
  micOn: boolean;
  cameraOn: boolean;
  screenSharing: boolean;
  participants: Record<string, Participant>;
  connected: boolean;
  reconnecting: boolean;
  elapsed: number;
  chatOpen: boolean;
  messages: ChatMessage[];
  participantsOpen: boolean;
  transcriptOpen: boolean;
  transcript: RecorderTranscriptEntry[];
  showQueue: boolean;
  queueOpen: boolean;
  queue: RecorderQueueEntry[];
  captionsOn: boolean;
  captions: Caption[];
  myLanguage: string;
  showOriginalCaptions: boolean;
  captionPosition: "top" | "bottom";
  captionFontSize: number;
}

const WIDTH = 1280;
const HEIGHT = 720;
const FPS = 25;

function makeHiddenVideo(stream: MediaStream): HTMLVideoElement {
  const v = document.createElement("video");
  v.srcObject = stream;
  v.muted = true;
  v.playsInline = true;
  // Must stay within the viewport (not off-screen) and appropriately sized —
  // browsers throttle/skip decoding <video> elements that are off-screen or
  // near-zero size to save power, which silently produces black frames here.
  v.style.position = "fixed";
  v.style.top = "0";
  v.style.left = "0";
  v.style.width = "320px";
  v.style.height = "180px";
  v.style.opacity = "0";
  v.style.zIndex = "-1";
  v.style.pointerEvents = "none";
  document.body.appendChild(v);
  v.play().catch(() => {});
  return v;
}

function destroyVideo(v: HTMLVideoElement) {
  v.pause();
  v.srcObject = null;
  v.remove();
}

export function useRecorder(options: UseRecorderOptions) {
  const {
    localStream,
    remoteStreams,
    screenStream,
    remoteScreenStreams,
    localName,
    micOn,
    cameraOn,
    screenSharing,
    participants,
  } = options;

  const [recording, setRecording] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioSourcesRef = useRef<Record<string, MediaStreamAudioSourceNode>>({});
  const audioDestRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const camTilesRef = useRef<Record<string, CamTile>>({});
  const screenTilesRef = useRef<Record<string, ScreenTile>>({});
  const pinnedKeyRef = useRef<string | null>(null);

  const uiRef = useRef<RecorderUiState>({} as RecorderUiState);
  uiRef.current = {
    localName: options.localName,
    roomCode: options.roomCode,
    micOn: options.micOn,
    cameraOn: options.cameraOn,
    screenSharing: options.screenSharing,
    captionsOn: options.captionsOn,
    captions: options.captions,
    myLanguage: options.myLanguage,
    showOriginalCaptions: options.showOriginalCaptions,
    captionPosition: options.captionPosition,
    captionFontSize: options.captionFontSize,
    connected: options.connected,
    reconnecting: options.reconnecting,
    elapsed: options.elapsed,
    chatOpen: options.chatOpen,
    messages: options.messages,
    participantsOpen: options.participantsOpen,
    participants: options.participants,
    transcriptOpen: options.transcriptOpen,
    transcript: options.transcript,
    showQueue: options.showQueue,
    queueOpen: options.queueOpen,
    queue: options.queue,
  };

  // Camera tiles stay in sync with the call roster, so joins/leaves and
  // camera/mic changes land in the recording immediately.
  useEffect(() => {
    const desired: Record<string, { stream: MediaStream; name: string; cameraOn: boolean; micOn: boolean; isLocal: boolean }> = {};
    if (localStream) desired.local = { stream: localStream, name: localName, cameraOn, micOn, isLocal: true };
    for (const [sid, stream] of Object.entries(remoteStreams)) {
      desired[sid] = {
        stream,
        name: participants[sid]?.full_name ?? "Participant",
        cameraOn: participants[sid]?.cameraOn !== false,
        micOn: participants[sid]?.micOn !== false,
        isLocal: false,
      };
    }

    for (const key of Object.keys(camTilesRef.current)) {
      if (!desired[key]) {
        destroyVideo(camTilesRef.current[key].video);
        delete camTilesRef.current[key];
      }
    }
    for (const [key, d] of Object.entries(desired)) {
      const existing = camTilesRef.current[key];
      if (!existing) {
        camTilesRef.current[key] = { key, ...d, video: makeHiddenVideo(d.stream) };
      } else {
        existing.name = d.name;
        existing.cameraOn = d.cameraOn;
        existing.micOn = d.micOn;
        existing.isLocal = d.isLocal;
        if (existing.video.srcObject !== d.stream) existing.video.srcObject = d.stream;
      }
    }
  }, [localStream, remoteStreams, localName, cameraOn, micOn, participants]);

  // Screen shares (local or remote) plus which one is currently pinned.
  useEffect(() => {
    const desired: Record<string, { stream: MediaStream; name: string }> = {};
    if (screenSharing && screenStream) desired.local = { stream: screenStream, name: "You're presenting" };
    for (const [sid, stream] of Object.entries(remoteScreenStreams)) {
      if (participants[sid]?.screenSharing) {
        desired[sid] = { stream, name: `${participants[sid]?.full_name ?? "Participant"} is presenting` };
      }
    }

    for (const key of Object.keys(screenTilesRef.current)) {
      if (!desired[key]) {
        destroyVideo(screenTilesRef.current[key].video);
        delete screenTilesRef.current[key];
      }
    }
    for (const [key, d] of Object.entries(desired)) {
      const existing = screenTilesRef.current[key];
      if (!existing) {
        screenTilesRef.current[key] = { key, name: d.name, video: makeHiddenVideo(d.stream) };
      } else {
        existing.name = d.name;
        if (existing.video.srcObject !== d.stream) existing.video.srcObject = d.stream;
      }
    }

    pinnedKeyRef.current = screenSharing
      ? "local"
      : Object.keys(remoteScreenStreams).find((sid) => participants[sid]?.screenSharing) ?? null;
  }, [screenSharing, screenStream, remoteScreenStreams, participants]);

  // Audio graph is mutated in place so a participant joining or leaving mid
  // recording is added/removed without restarting the recorder.
  useEffect(() => {
    const ctx = audioContextRef.current;
    const dest = audioDestRef.current;
    if (!ctx || !dest) return;

    const desired: Record<string, MediaStream> = {};
    if (localStream && localStream.getAudioTracks().length > 0) desired.local = localStream;
    for (const [sid, stream] of Object.entries(remoteStreams)) {
      if (stream.getAudioTracks().length > 0) desired[sid] = stream;
    }

    for (const key of Object.keys(audioSourcesRef.current)) {
      if (!desired[key]) {
        audioSourcesRef.current[key].disconnect();
        delete audioSourcesRef.current[key];
      }
    }
    for (const [key, stream] of Object.entries(desired)) {
      if (!audioSourcesRef.current[key]) {
        const source = ctx.createMediaStreamSource(stream);
        source.connect(dest);
        audioSourcesRef.current[key] = source;
      }
    }
  }, [localStream, remoteStreams, recording]);

  useEffect(() => {
    return () => {
      Object.values(camTilesRef.current).forEach((t) => destroyVideo(t.video));
      Object.values(screenTilesRef.current).forEach((t) => destroyVideo(t.video));
      camTilesRef.current = {};
      screenTilesRef.current = {};
    };
  }, []);

  const start = useCallback(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;

    const renderFrame = () => {
      const pinnedKey = pinnedKeyRef.current;
      drawMeetingFrame(ctx, WIDTH, HEIGHT, {
        ui: uiRef.current,
        camTiles: Object.values(camTilesRef.current),
        pinnedScreen: pinnedKey ? screenTilesRef.current[pinnedKey] ?? null : null,
      });
    };
    renderFrame();

    // captureStream(0) + an interval-driven requestFrame keeps producing
    // frames even when the tab is backgrounded (requestAnimationFrame stops
    // there, which stalls the video track and leaves it shorter than the
    // audio track).
    const canvasStream = canvas.captureStream(0);
    const videoTrack = canvasStream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack;

    const audioContext = new AudioContext();
    audioContextRef.current = audioContext;
    const destination = audioContext.createMediaStreamDestination();
    audioDestRef.current = destination;
    audioSourcesRef.current = {};

    const seedAudio: Record<string, MediaStream> = {};
    if (localStream && localStream.getAudioTracks().length > 0) seedAudio.local = localStream;
    for (const [sid, stream] of Object.entries(remoteStreams)) {
      if (stream.getAudioTracks().length > 0) seedAudio[sid] = stream;
    }
    for (const [key, stream] of Object.entries(seedAudio)) {
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(destination);
      audioSourcesRef.current[key] = source;
    }
    // Keeps the mixed output flowing even while nobody is unmuted, so the
    // audio track never goes silent-idle and drifts from the video track.
    const keepAlive = audioContext.createConstantSource();
    const keepAliveGain = audioContext.createGain();
    keepAliveGain.gain.value = 0.0001;
    keepAlive.connect(keepAliveGain).connect(destination);
    keepAlive.start();

    const combined = new MediaStream([videoTrack, ...destination.stream.getAudioTracks()]);

    const recorder = new MediaRecorder(combined, { mimeType: "video/webm;codecs=vp8,opus" });
    chunksRef.current = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };

    timerRef.current = window.setInterval(() => {
      renderFrame();
      videoTrack.requestFrame();
    }, 1000 / FPS);

    recorder.start(1000);
    mediaRecorderRef.current = recorder;
    setRecording(true);
  }, [localStream, remoteStreams]);

  const stop = useCallback((): Promise<Blob | null> => {
    return new Promise((resolve) => {
      const recorder = mediaRecorderRef.current;
      if (!recorder) {
        resolve(null);
        return;
      }
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "video/webm" });
        chunksRef.current = [];
        if (timerRef.current) window.clearInterval(timerRef.current);
        timerRef.current = null;
        Object.values(audioSourcesRef.current).forEach((s) => s.disconnect());
        audioSourcesRef.current = {};
        audioDestRef.current = null;
        audioContextRef.current?.close();
        audioContextRef.current = null;
        mediaRecorderRef.current = null;
        setRecording(false);
        resolve(blob);
      };
      // Flush a final frame so the video track's last timestamp lines up with
      // the audio track's.
      if (timerRef.current) window.clearInterval(timerRef.current);
      timerRef.current = null;
      recorder.requestData();
      recorder.stop();
    });
  }, []);

  return { recording, start, stop };
}
