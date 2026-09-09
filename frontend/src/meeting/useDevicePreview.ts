import { useCallback, useEffect, useRef, useState } from "react";

// Explicitly requesting these (instead of relying on implicit browser
// defaults) is our echo cancellation / noise suppression / gain control —
// the same native processing Meet/Zoom/Teams rely on, running before the
// audio ever reaches our JS. Far more reliable than anything hand-rolled
// on an already-downsampled mono 16kHz stream with no reference signal.
const AUDIO_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
};
interface UseDevicePreviewResult {
  stream: MediaStream | null;
  micOn: boolean;
  cameraOn: boolean;
  loading: boolean;
  error: string | null;
  toggleMic: () => void;
  toggleCamera: () => void;
  /** Hand the stream off to the in-call hook instead of stopping its tracks on unmount. */
  release: () => MediaStream | null;
}

/**
 * Acquires camera/mic for the pre-join lobby preview. Mirrors the same
 * graceful fallback as the in-call hook: neither device is ever a hard
 * requirement to join.
 */
export function useDevicePreview(enabled: boolean): UseDevicePreviewResult {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [micOn, setMicOn] = useState(true);
  const [cameraOn, setCameraOn] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const releasedRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    releasedRef.current = false;

    async function acquire() {
      let s: MediaStream | null = null;
      try {
        s = await navigator.mediaDevices.getUserMedia({ video: true, audio: AUDIO_CONSTRAINTS });
      } catch (videoAudioErr) {
  
  try {
    s = await navigator.mediaDevices.getUserMedia({
      video: false,
      audio: AUDIO_CONSTRAINTS
    });
        } catch {
          try {
            s = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
          } catch (err) {
            if (!cancelled) {
              const reason = err instanceof DOMException ? err.name : "unknown error";
              const hint =
                reason === "NotReadableError"
                  ? "Your camera/mic may already be in use by another tab, window, or app."
                  : reason === "NotAllowedError"
                    ? "Permission was denied. Check the site permissions and reload."
                    : reason === "NotFoundError"
                      ? "No camera/microphone was found on this device."
                      : "Check your device and browser permissions.";
              setError(`Could not access camera/microphone (${reason}). ${hint} You can still join without video/audio.`);
            }
          }
        }
      }

      if (cancelled) {
        s?.getTracks().forEach((t) => t.stop());
        return;
      }

      // Getting here means permission was granted (or the device doesn't
      // exist, in which case there's nothing to disable) — but mic/camera
      // should start OFF by default regardless. The user opts in explicitly
      // via the toggle buttons below, which just flip .enabled on these
      // already-granted tracks (instant, no repeat permission prompt).
      const audioTrack = s?.getAudioTracks()[0] ?? null;
      const videoTrack = s?.getVideoTracks()[0] ?? null;
      if (audioTrack) audioTrack.enabled = false;
      if (videoTrack) videoTrack.enabled = false;

      streamRef.current = s;
      setStream(s);
      setMicOn(false);
      setCameraOn(false);

      setLoading(false);
    }

    acquire();

    return () => {
      cancelled = true;
      if (!releasedRef.current) {
        streamRef.current?.getTracks().forEach((t) => t.stop());
      }
      streamRef.current = null;
      setStream(null);
    };
  }, [enabled]);

  const toggleMic = useCallback(() => {
    const track = streamRef.current?.getAudioTracks()[0];
    if (track) {
      track.enabled = !track.enabled;
      setMicOn(track.enabled);
    }
  }, []);

  const toggleCamera = useCallback(async () => {
  const currentStream = streamRef.current;
  if (!currentStream) return;

  const videoTrack = currentStream.getVideoTracks()[0];

  // CAMERA OFF
  // CAMERA OFF
if (cameraOn) {
  if (videoTrack) {
    videoTrack.enabled = false;
  }

  setCameraOn(false);
  return;
}

  // CAMERA ON — the track already exists (just disabled) whenever
  // permission was granted at acquire time, so just re-enable it instead of
  // requesting getUserMedia again (which would be slower and could prompt
  // again in some browsers).
  if (videoTrack) {
    videoTrack.enabled = true;
    setCameraOn(true);
    return;
  }

  try {
    const videoStream = await navigator.mediaDevices.getUserMedia({
      video: true,
    });

    const newVideoTrack = videoStream.getVideoTracks()[0];

    if (!newVideoTrack) {
      throw new Error("No video track returned");
    }

    const audioTracks = currentStream.getAudioTracks();

    const newStream = new MediaStream([
      ...audioTracks,
      newVideoTrack,
    ]);

    streamRef.current = newStream;
    setStream(newStream);
    setCameraOn(true);
  } catch (err) {
    console.error("Unable to restart camera", err);
  }
}, [cameraOn]);

  const release = useCallback(() => {
    releasedRef.current = true;
    return streamRef.current;
  }, []);

  return { stream, micOn, cameraOn, loading, error, toggleMic, toggleCamera, release };
}
