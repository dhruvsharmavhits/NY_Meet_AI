import { useEffect, useRef } from "react";
import { MicOffIcon } from "@/components/Icons";

interface VideoTileProps {
  stream: MediaStream | null;
  label: string;
  muted?: boolean;
  mirrored?: boolean;
  micMuted?: boolean;
  cameraOff?: boolean;
}

// Generate a consistent color from a name
function colorForName(name: string): string {
  const colors = [
    "#7c3aed",
    "#4285f4",
    "#f97316",
    "#0f9d58",
    "#ea4335",
    "#2563eb",
    "#d946ef",
    "#059669",
    "#e11d48",
    "#8b5cf6",
  ];

  let hash = 0;

  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }

  return colors[Math.abs(hash) % colors.length];
}

function initialsFor(name: string): string {
  const trimmed = name.trim();

  if (!trimmed) return "?";

  const parts = trimmed.split(/\s+/);

  return (
    ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() ||
    trimmed[0].toUpperCase()
  );
}

export function VideoTile({
  stream,
  label,
  muted = false,
  mirrored,
  micMuted,
  cameraOff,
}: VideoTileProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  /*
   * VIDEO
   *
   * Only give video tracks to the video element.
   * For local muted preview, this also prevents the microphone
   * from being consumed by the preview element.
   */
  useEffect(() => {
    const video = videoRef.current;

    if (!video) return;

    const videoTracks = stream?.getVideoTracks() ?? [];

    const videoStream =
      videoTracks.length > 0
        ? new MediaStream(videoTracks)
        : null;

    video.srcObject = videoStream;

    console.log(
      `[rtc] VideoTile video srcObject set ${JSON.stringify({
        label,
        streamId: stream?.id ?? null,
        videoTracks: videoTracks.map((track) => ({
          id: track.id,
          readyState: track.readyState,
          enabled: track.enabled,
          muted: track.muted,
        })),
        localMuted: muted,
      })}`
    );

    if (videoStream) {
      video.play().catch((err) => {
        console.log(
          `[rtc] VideoTile video play rejected ${JSON.stringify({
            label,
            error: String(err),
          })}`
        );
      });
    }

    return () => {
      video.pause();
      video.srcObject = null;
    };
  }, [stream, label, muted]);

  /*
   * AUDIO
   *
   * Remote audio gets its own dedicated <audio> element.
   *
   * This is the important change.
   *
   * Never use the muted local-preview video element to play
   * remote audio.
   */
  useEffect(() => {
    const audio = audioRef.current;

    if (!audio) return;

    // Local preview should NEVER play its own microphone.
    if (muted) {
      audio.pause();
      audio.srcObject = null;

      console.log(
        `[rtc] VideoTile local audio disabled ${JSON.stringify({
          label,
        })}`
      );

      return;
    }

    const audioTracks = stream?.getAudioTracks() ?? [];

    const audioStream =
      audioTracks.length > 0
        ? new MediaStream(audioTracks)
        : null;

    audio.srcObject = audioStream;

    console.log(
      `[rtc] VideoTile audio srcObject set ${JSON.stringify({
        label,
        streamId: stream?.id ?? null,
        audioTracks: audioTracks.map((track) => ({
          id: track.id,
          readyState: track.readyState,
          enabled: track.enabled,
          muted: track.muted,
        })),
      })}`
    );

    if (!audioStream) {
      audio.pause();
      return;
    }

    audio.volume = 1;
    audio.muted = false;

    const playAudio = async () => {
      try {
        await audio.play();

        console.log(
          `[rtc] 🔊 VideoTile remote audio PLAYING ${JSON.stringify({
            label,
            streamId: stream?.id ?? null,
            audioTracks: audioStream.getAudioTracks().length,
          })}`
        );
      } catch (err) {
        console.error(
          `[rtc] ❌ VideoTile remote audio PLAY FAILED`,
          {
            label,
            error: String(err),
          }
        );
      }
    };

    playAudio();

    return () => {
      audio.pause();
      audio.srcObject = null;
    };
  }, [stream, label, muted]);

  const avatarColor = colorForName(label);
  const showAvatar = !stream || cameraOff;

  return (
    <div className="group relative h-full w-full overflow-hidden rounded-2xl bg-[#1e1e2e] transition-all duration-300">

      {/* Video */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className={`h-full w-full object-contain ${
          mirrored ? "-scale-x-100" : ""
        } ${showAvatar ? "hidden" : ""}`}
      />

      {/* Dedicated remote audio element */}
      <audio
        ref={audioRef}
        autoPlay
        playsInline
      />

      {showAvatar && (
        <div
          className="flex h-full w-full items-center justify-center"
          style={{
            background: `linear-gradient(
              135deg,
              ${avatarColor}22 0%,
              ${avatarColor}11 100%
            )`,
          }}
        >
          <div
            className="flex h-20 w-20 items-center justify-center rounded-full text-2xl font-semibold text-white shadow-lg sm:h-24 sm:w-24 sm:text-3xl"
            style={{
              backgroundColor: avatarColor,
              boxShadow: `0 8px 32px ${avatarColor}44`,
            }}
          >
            {initialsFor(label)}
          </div>
        </div>
      )}

      {/* Bottom gradient bar */}
      <div className="absolute bottom-0 left-0 right-0 flex items-center gap-2 bg-gradient-to-t from-black/70 via-black/30 to-transparent px-4 py-3">
        {micMuted && (
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#ea4335]/90 backdrop-blur-sm">
            <MicOffIcon size={14} className="text-white" />
          </span>
        )}

        <span className="truncate text-sm font-medium text-white drop-shadow-md">
          {label}
        </span>
      </div>

      {/* Hover ring */}
      <div className="pointer-events-none absolute inset-0 rounded-2xl ring-2 ring-transparent transition-all duration-300 group-hover:ring-[#4285f4]/40 group-hover:shadow-[inset_0_0_30px_rgba(66,133,244,0.05)]" />
    </div>
  );
}