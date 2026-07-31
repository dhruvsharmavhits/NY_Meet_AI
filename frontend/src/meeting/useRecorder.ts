import { useCallback, useRef, useState } from "react";

interface UseRecorderOptions {
  localStream: MediaStream | null;
  remoteStreams: Record<string, MediaStream>;
}

export function useRecorder({ localStream, remoteStreams }: UseRecorderOptions) {
  const [recording, setRecording] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const rafRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const hiddenVideosRef = useRef<HTMLVideoElement[]>([]);

  const start = useCallback(() => {
    const streams = [localStream, ...Object.values(remoteStreams)].filter(
      (s): s is MediaStream => s !== null
    );
    if (streams.length === 0) return;

    const canvas = document.createElement("canvas");
    canvas.width = 1280;
    canvas.height = 720;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const videos = streams.map((s) => {
      const v = document.createElement("video");
      v.srcObject = s;
      v.muted = true;
      v.playsInline = true;
      v.play().catch(() => {});
      return v;
    });
    hiddenVideosRef.current = videos;

    function draw() {
      if (!ctx) return;
      ctx.fillStyle = "#111827";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const cols = Math.ceil(Math.sqrt(videos.length));
      const rows = Math.ceil(videos.length / cols);
      const cellW = canvas.width / cols;
      const cellH = canvas.height / rows;

      videos.forEach((v, i) => {
        if (v.readyState >= 2) {
          const x = (i % cols) * cellW;
          const y = Math.floor(i / cols) * cellH;
          ctx.drawImage(v, x, y, cellW, cellH);
        }
      });

      rafRef.current = requestAnimationFrame(draw);
    }
    draw();

    const audioContext = new AudioContext();
    audioContextRef.current = audioContext;
    const destination = audioContext.createMediaStreamDestination();
    streams.forEach((s) => {
      if (s.getAudioTracks().length > 0) {
        audioContext.createMediaStreamSource(s).connect(destination);
      }
    });

    const canvasStream = canvas.captureStream(30);
    const combined = new MediaStream([
      ...canvasStream.getVideoTracks(),
      ...destination.stream.getAudioTracks(),
    ]);

    const recorder = new MediaRecorder(combined, { mimeType: "video/webm;codecs=vp8,opus" });
    chunksRef.current = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };
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
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
        audioContextRef.current?.close();
        audioContextRef.current = null;
        hiddenVideosRef.current.forEach((v) => {
          v.pause();
          v.srcObject = null;
        });
        hiddenVideosRef.current = [];
        mediaRecorderRef.current = null;
        setRecording(false);
        resolve(blob);
      };
      recorder.stop();
    });
  }, []);

  return { recording, start, stop };
}
