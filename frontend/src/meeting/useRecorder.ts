import { useCallback, useRef, useState } from "react";
import { MeetingCompositor, RECORDING_FPS, type CompositorState } from "@/meeting/recordingCompositor";

// Only H.264/AAC counts as MP4 here: a bare "video/mp4" request can hand back
// VP9-in-MP4, which most players and editors refuse to open. Anything else
// records as WebM and the backend transcodes it to a real MP4.
const MIME_CANDIDATES = [
  'video/mp4;codecs="avc1.640028,mp4a.40.2"',
  'video/mp4;codecs="avc1.4d0028,mp4a.40.2"',
  'video/mp4;codecs="avc1.42E01E,mp4a.40.2"',
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
];

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  return MIME_CANDIDATES.find((type) => MediaRecorder.isTypeSupported(type));
}

export function useRecorder() {
  const [recording, setRecording] = useState(false);

  const compositorRef = useRef<MeetingCompositor | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const containerRef = useRef<string>("video/webm");
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioSourcesRef = useRef<Map<MediaStream, MediaStreamAudioSourceNode>>(new Map());
  const audioDestRef = useRef<MediaStreamAudioDestinationNode | null>(null);

  const connectAudio = useCallback((stream: MediaStream | null) => {
    if (!stream || stream.getAudioTracks().length === 0) return;
    const ctx = audioContextRef.current;
    const dest = audioDestRef.current;
    if (!ctx || !dest) return;
    if (audioSourcesRef.current.has(stream)) return;
    const source = ctx.createMediaStreamSource(stream);
    source.connect(dest);
    audioSourcesRef.current.set(stream, source);
  }, []);

  const updateState = useCallback(
    (state: CompositorState) => {
      if (!compositorRef.current) return;
      compositorRef.current.setState(state);
      connectAudio(state.localStream);
      connectAudio(state.screenStream);
      Object.values(state.remoteStreams).forEach(connectAudio);
      Object.values(state.remoteScreenStreams).forEach(connectAudio);
    },
    [connectAudio],
  );

  const start = useCallback(
    async (initialState: CompositorState) => {
      const compositor = new MeetingCompositor();
      compositorRef.current = compositor;
      compositor.setState(initialState);

      const audioContext = new AudioContext({ sampleRate: 48000 });
      audioContextRef.current = audioContext;
      const destination = audioContext.createMediaStreamDestination();
      audioDestRef.current = destination;
      audioSourcesRef.current = new Map();

      [
        initialState.localStream,
        initialState.screenStream,
        ...Object.values(initialState.remoteStreams),
        ...Object.values(initialState.remoteScreenStreams),
      ].forEach(connectAudio);

      compositor.startLoop();
      const videoStream = compositor.captureStream(RECORDING_FPS);
      const combined = new MediaStream([...videoStream.getVideoTracks(), ...destination.stream.getAudioTracks()]);

      const mimeType = pickMimeType();
      containerRef.current = mimeType?.startsWith("video/mp4") ? "video/mp4" : "video/webm";
      const recorder = new MediaRecorder(combined, {
        ...(mimeType ? { mimeType } : {}),
        videoBitsPerSecond: 3_500_000,
        audioBitsPerSecond: 128_000,
      });
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.start(1000);
      mediaRecorderRef.current = recorder;
      setRecording(true);
    },
    [connectAudio],
  );

  const stop = useCallback((): Promise<Blob | null> => {
    return new Promise((resolve) => {
      const recorder = mediaRecorderRef.current;
      if (!recorder) {
        resolve(null);
        return;
      }
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: containerRef.current });
        chunksRef.current = [];
        audioSourcesRef.current.forEach((source) => source.disconnect());
        audioSourcesRef.current.clear();
        audioContextRef.current?.close();
        audioContextRef.current = null;
        audioDestRef.current = null;
        compositorRef.current?.stopLoop();
        compositorRef.current = null;
        mediaRecorderRef.current = null;
        setRecording(false);
        resolve(blob);
      };
      recorder.stop();
    });
  }, []);

  return { recording, start, stop, updateState };
}
