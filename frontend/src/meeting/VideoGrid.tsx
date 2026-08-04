import { VideoTile } from "@/meeting/VideoTile";
import type { Participant } from "@/meeting/types";

interface VideoGridProps {
  localStream: MediaStream | null;
  screenStream: MediaStream | null;
  localName: string;
  micOn: boolean;
  cameraOn: boolean;
  screenSharing: boolean;
  remoteStreams: Record<string, MediaStream>;
  remoteScreenStreams: Record<string, MediaStream>;
  participants: Record<string, Participant>;
}

interface Tile {
  key: string;
  stream: MediaStream | null;
  label: string;
  muted?: boolean;
  mirrored?: boolean;
  micMuted?: boolean;
  cameraOff?: boolean;
}

function renderTile(t: Tile) {
  return (
    <VideoTile
      stream={t.stream}
      label={t.label}
      muted={t.muted}
      mirrored={t.mirrored}
      micMuted={t.micMuted}
      cameraOff={t.cameraOff}
    />
  );
}

export function VideoGrid({
  localStream,
  screenStream,
  localName,
  micOn,
  cameraOn,
  screenSharing,
  remoteStreams,
  remoteScreenStreams,
  participants,
}: VideoGridProps) {
  const remoteSids = Object.keys(participants);
  const remoteSharingSid = remoteSids.find((sid) => participants[sid]?.screenSharing);

  // A screen share — ours or a remote's — takes over as one big, automatically
  // pinned tile, with everyone (including the presenter's camera) in a
  // filmstrip alongside it (matches the familiar Meet/Zoom/Teams layout).
  const pinned: Tile | null = screenSharing
    ? { key: "local-screen", stream: screenStream, label: "You're presenting", muted: true }
    : remoteSharingSid
      ? {
          key: `${remoteSharingSid}-screen`,
          stream: remoteScreenStreams[remoteSharingSid] ?? null,
          label: `${participants[remoteSharingSid]?.full_name ?? "Participant"} is presenting`,
        }
      : null;

  const localTile: Tile = {
    key: "local",
    stream: localStream,
    label: `${localName} (you)`,
    muted: true,
    mirrored: true,
    micMuted: !micOn,
    cameraOff: !cameraOn,
  };

  const remoteTiles: Tile[] = remoteSids.map((sid) => ({
    key: sid,
    stream: remoteStreams[sid] ?? null,
    label: participants[sid]?.full_name ?? "Participant",
    micMuted: participants[sid]?.micOn === false,
    cameraOff: participants[sid]?.cameraOn === false,
  }));

  const stripTiles = [localTile, ...remoteTiles];

  if (pinned) {
    return (
      <div className="flex flex-1 flex-col gap-2 overflow-hidden p-2 sm:p-3 lg:flex-row">
        <div className="min-h-0 min-w-0 flex-1">{renderTile(pinned)}</div>
        <div className="flex gap-2 overflow-x-auto lg:w-[220px] lg:flex-shrink-0 lg:flex-col lg:overflow-x-hidden lg:overflow-y-auto">
          {stripTiles.map((t) => (
            <div key={t.key} className="h-24 w-36 flex-shrink-0 lg:h-32 lg:w-full">
              {renderTile(t)}
            </div>
          ))}
        </div>
      </div>
    );
  }

  const totalTiles = stripTiles.length;

  // Dynamic grid: single tile fills the whole area, 2 tiles side-by-side, etc.
  const gridClass =
    totalTiles === 1
      ? "grid-cols-1"
      : totalTiles === 2
        ? "grid-cols-1 sm:grid-cols-2"
        : totalTiles <= 4
          ? "grid-cols-2"
          : totalTiles <= 6
            ? "grid-cols-2 lg:grid-cols-3"
            : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4";

  return (
    <div className={`grid flex-1 auto-rows-fr gap-2 p-2 sm:p-3 ${gridClass}`}>
      {stripTiles.map((t) => (
        <div key={t.key} className="h-full w-full">
          {renderTile(t)}
        </div>
      ))}
    </div>
  );
}
