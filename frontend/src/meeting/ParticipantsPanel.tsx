import type { Participant } from "@/meeting/types";
import { CloseIcon, MicIcon } from "@/components/Icons";

interface ParticipantsPanelProps {
  localName: string;
  participants: Record<string, Participant>;
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

function initialsFor(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "?";
  const parts = trimmed.split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || trimmed[0].toUpperCase();
}

export function ParticipantsPanel({ localName, participants, onClose }: ParticipantsPanelProps) {
  const list = Object.values(participants);

  return (
    <div className="flex w-[320px] flex-col panel-slide-enter" style={{ background: "rgba(15, 12, 41, 0.85)", backdropFilter: "blur(24px)", borderLeft: "1px solid rgba(255,255,255,0.06)" }}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4">
        <h2 className="text-base font-bold text-white">People ({list.length + 1})</h2>
        <button
          id="close-participants"
          onClick={onClose}
          className="flex h-9 w-9 items-center justify-center rounded-xl text-white/50 hover:bg-white/10 transition-all duration-200"
          aria-label="Close"
        >
          <CloseIcon size={18} />
        </button>
      </div>

      {/* Participant list */}
      <div className="flex-1 overflow-y-auto px-3">
        <p className="mb-2 px-2 text-[10px] font-bold text-white/25 uppercase tracking-[0.15em]">In call</p>

        {/* You */}
        <div className="flex items-center gap-3 rounded-xl px-3 py-3 hover:bg-white/5 transition-all duration-200">
          <div
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl text-xs font-bold text-white"
            style={{ background: `linear-gradient(135deg, ${colorForName(localName)}, ${colorForName(localName)}aa)` }}
          >
            {initialsFor(localName)}
          </div>
          <span className="flex-1 truncate text-sm font-medium text-white/80">{localName} (you)</span>
          <MicIcon size={16} className="text-white/20" />
        </div>

        {/* Remote participants */}
        {list.map((p) => (
          <div
            key={p.sid}
            className="flex items-center gap-3 rounded-xl px-3 py-3 hover:bg-white/5 transition-all duration-200"
          >
            <div
              className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl text-xs font-bold text-white"
              style={{ background: `linear-gradient(135deg, ${colorForName(p.full_name)}, ${colorForName(p.full_name)}aa)` }}
            >
              {initialsFor(p.full_name)}
            </div>
            <span className="flex-1 truncate text-sm font-medium text-white/80">{p.full_name}</span>
            <MicIcon size={16} className="text-white/20" />
          </div>
        ))}
      </div>
    </div>
  );
}
