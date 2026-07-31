import { useQuery } from "@tanstack/react-query";
import { fetchTranscript } from "@/services/api";
import { CloseIcon, DownloadIcon } from "@/components/Icons";

interface TranscriptPanelProps {
  roomCode: string;
  onClose: () => void;
}

function colorForName(name: string): string {
  const colors = [
    "#c084fc", "#60a5fa", "#fb923c", "#34d399", "#f87171",
    "#818cf8", "#fbbf24", "#a78bfa", "#f472b6", "#22d3ee",
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

export function TranscriptPanel({ roomCode, onClose }: TranscriptPanelProps) {
  const { data: entries, isLoading } = useQuery({
    queryKey: ["transcript", roomCode],
    queryFn: () => fetchTranscript(roomCode),
    refetchInterval: 5000,
  });

  function handleDownload() {
    if (!entries) return;
    const lines = entries.map(
      (e) => `[${new Date(e.created_at).toLocaleTimeString()}] ${e.speaker_name} (${e.lang}): ${e.text}`
    );
    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `transcript-${roomCode}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex w-[360px] flex-col panel-slide-enter" style={{ background: "rgba(15, 12, 41, 0.85)", backdropFilter: "blur(24px)", borderLeft: "1px solid rgba(255,255,255,0.06)" }}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4">
        <h2 className="text-base font-bold text-white">Transcript</h2>
        <button
          id="close-transcript"
          onClick={onClose}
          className="flex h-9 w-9 items-center justify-center rounded-xl text-white/50 hover:bg-white/10 transition-all duration-200"
          aria-label="Close"
        >
          <CloseIcon size={18} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-5">
        {isLoading && (
          <div className="flex items-center justify-center py-16">
            <div className="meet-spinner" />
          </div>
        )}
        {!isLoading && (!entries || entries.length === 0) && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/5">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="rgba(255,255,255,0.2)">
                <path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z" />
              </svg>
            </div>
            <p className="text-sm text-white/30">No speech transcribed yet</p>
            <p className="mt-1 text-xs text-white/15">Will appear as people speak</p>
          </div>
        )}
        {entries?.map((e, i) => (
          <div key={i} className="mb-4 animate-meet-fade-in">
            <div className="flex items-center gap-2 mb-1">
              <span
                className="text-xs font-bold"
                style={{ color: colorForName(e.speaker_name) }}
              >
                {e.speaker_name}
              </span>
              <span className="text-[10px] text-white/20">
                {new Date(e.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
              <span className="rounded-md bg-white/8 px-1.5 py-0.5 text-[10px] uppercase font-semibold text-white/30">
                {e.lang}
              </span>
            </div>
            <p className="text-sm leading-relaxed text-white/70">{e.text}</p>
          </div>
        ))}
      </div>

      {/* Download button */}
      <div className="px-4 py-3" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
        <button
          id="download-transcript"
          onClick={handleDownload}
          disabled={!entries || entries.length === 0}
          className="btn-gradient flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm disabled:opacity-30"
        >
          <DownloadIcon size={18} />
          Download transcript
        </button>
      </div>
    </div>
  );
}
