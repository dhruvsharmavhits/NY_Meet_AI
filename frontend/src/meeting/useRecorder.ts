import { useCallback, useRef, useState } from "react";

interface UseRecorderOptions {
  localStream: MediaStream | null;
  remoteStreams: Record<string, MediaStream>;
}

export function useRecorder({ localStream, remoteStreams }: UseRecorderOptions) {
  const [recording, setRecording] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const displayStreamRef = useRef<MediaStream | null>(null);

  const start = useCallback(async () => {
    const displayStream = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: 30 },
      audio: true,
    });
    displayStreamRef.current = displayStream;

    const audioContext = new AudioContext();
    audioContextRef.current = audioContext;
    const destination = audioContext.createMediaStreamDestination();

    [localStream, ...Object.values(remoteStreams), displayStream].forEach((s) => {
      if (s && s.getAudioTracks().length > 0) {
        audioContext.createMediaStreamSource(s).connect(destination);
      }
    });

    const combined = new MediaStream([
      ...displayStream.getVideoTracks(),
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

    displayStream.getVideoTracks()[0].onended = () => {
      recorder.stop();
    };
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
        audioContextRef.current?.close();
        audioContextRef.current = null;
        displayStreamRef.current?.getTracks().forEach((t) => t.stop());
        displayStreamRef.current = null;
        mediaRecorderRef.current = null;
        setRecording(false);
        resolve(blob);
      };
      recorder.stop();
    });
  }, []);

  return { recording, start, stop };
}
