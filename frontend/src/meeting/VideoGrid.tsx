import { VideoTile } from "@/meeting/VideoTile";
import type { Participant } from "@/meeting/types";

interface VideoGridProps {
  localTileId: number | null;
  localScreenTileId: number | null;
  onBindVideoTile: (tileId: number, el: HTMLVideoElement) => void;
  onUnbindVideoTile: (tileId: number) => void;
  localName: string;
  micOn: boolean;
  cameraOn: boolean;
  screenSharing: boolean;
  participants: Record<string, Participant>;
}

interface Tile {
  key: string;
  tileId: number | null;
  label: string;
  mirrored?: boolean;
  micMuted?: boolean;
  cameraOff?: boolean;
}

function renderTile(t: Tile, onBind: (tileId: number, el: HTMLVideoElement) => void, onUnbind: (tileId: number) => void) {
  return (
    <VideoTile
      tileId={t.tileId}
      onBind={onBind}
      onUnbind={onUnbind}
      label={t.label}
      mirrored={t.mirrored}
      micMuted={t.micMuted}
      cameraOff={t.cameraOff}
    />
  );
}

export function VideoGrid({
  localTileId,
  localScreenTileId,
  onBindVideoTile,
  onUnbindVideoTile,
  localName,
  micOn,
  cameraOn,
  screenSharing,
  participants,
}: VideoGridProps) {
  const remoteSids = Object.keys(participants);
  const remoteSharingSid = remoteSids.find((sid) => participants[sid]?.screenSharing);

  // A screen share — ours or a remote's — takes over as one big, automatically
  // pinned tile, with everyone (including the presenter's camera) in a
  // filmstrip alongside it (matches the familiar Meet/Zoom/Teams layout).
  const pinned: Tile | null = screenSharing
    ? { key: "local-screen", tileId: localScreenTileId, label: "You're presenting" }
    : remoteSharingSid
      ? {
          key: `${remoteSharingSid}-screen`,
          tileId: participants[remoteSharingSid]?.screenTileId ?? null,
          label: `${participants[remoteSharingSid]?.full_name ?? "Participant"} is presenting`,
        }
      : null;

  const localTile: Tile = {
    key: "local",
    tileId: localTileId,
    label: `${localName} (you)`,
    mirrored: true,
    micMuted: !micOn,
    cameraOff: !cameraOn,
  };

  const remoteTiles: Tile[] = remoteSids.map((sid) => ({
    key: sid,
    tileId: participants[sid]?.tileId ?? null,
    label: participants[sid]?.full_name ?? "Participant",
    micMuted: participants[sid]?.micOn === false,
    cameraOff: participants[sid]?.cameraOn === false,
  }));

  const stripTiles = [localTile, ...remoteTiles];

  if (pinned) {
    return (
      <div className="flex flex-1 flex-col gap-2 overflow-hidden p-2 sm:p-3 lg:flex-row">
        <div className="min-h-0 min-w-0 flex-1">{renderTile(pinned, onBindVideoTile, onUnbindVideoTile)}</div>
        <div className="flex gap-2 overflow-x-auto lg:w-[220px] lg:flex-shrink-0 lg:flex-col lg:overflow-x-hidden lg:overflow-y-auto">
          {stripTiles.map((t) => (
            <div key={t.key} className="h-24 w-36 flex-shrink-0 lg:h-32 lg:w-full">
              {renderTile(t, onBindVideoTile, onUnbindVideoTile)}
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
          {renderTile(t, onBindVideoTile, onUnbindVideoTile)}
        </div>
      ))}
    </div>
  );
}
