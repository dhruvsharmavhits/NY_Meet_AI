import { VideoTile } from "@/meeting/VideoTile";
import type { Participant } from "@/meeting/types";

interface VideoGridProps {
  localStream: MediaStream | null;
  localName: string;
  micOn: boolean;
  cameraOn: boolean;
  remoteStreams: Record<string, MediaStream>;
  participants: Record<string, Participant>;
}

export function VideoGrid({ localStream, localName, micOn, cameraOn, remoteStreams, participants }: VideoGridProps) {
  const remoteSids = Object.keys(remoteStreams);
  const totalTiles = remoteSids.length + 1;

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
      <VideoTile
        stream={localStream}
        label={`${localName} (you)`}
        muted
        mirrored
        micMuted={!micOn}
        cameraOff={!cameraOn}
      />
      {remoteSids.map((sid) => (
        <VideoTile key={sid} stream={remoteStreams[sid]} label={participants[sid]?.full_name ?? "Participant"} />
      ))}
    </div>
  );
}
