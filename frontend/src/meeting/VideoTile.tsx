import { useEffect, useRef } from "react";
import { MicOffIcon } from "@/components/Icons";

interface VideoTileProps {
  tileId: number | null;
  onBind: (tileId: number, el: HTMLVideoElement) => void;
  onUnbind: (tileId: number) => void;
  label: string;
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
  const cleaned = name
    .replace(/\s*\(you\)\s*$/i, "")
    .trim();

  if (!cleaned) return "?";

  const parts = cleaned.split(/\s+/);

  if (parts.length === 1) {
    return parts[0][0].toUpperCase();
  }

  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export function VideoTile({
  tileId,
  onBind,
  onUnbind,
  label,
  mirrored,
  micMuted,
  cameraOff,
}: VideoTileProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  // Chime binds/unbinds the video stream imperatively onto this element by
  // tileId — there is no MediaStream to hand the <video> element directly.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || tileId === null) return;

    onBind(tileId, video);
    return () => onUnbind(tileId);
  }, [tileId, onBind, onUnbind]);

  const avatarColor = colorForName(label);
  const showAvatar = tileId === null || cameraOff;

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
