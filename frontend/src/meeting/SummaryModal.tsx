import { useQuery } from "@tanstack/react-query";
import { fetchSummary } from "@/services/api";
import { CloseIcon } from "@/components/Icons";

interface SummaryModalProps {
  roomCode: string;
  onClose: () => void;
}

function formatDuration(seconds: number | null): string {
  if (seconds === null) return "not started";
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes}m ${secs}s`;
}

export function SummaryModal({ roomCode, onClose }: SummaryModalProps) {
  const { data: summary, isLoading } = useQuery({
    queryKey: ["summary", roomCode],
    queryFn: () => fetchSummary(roomCode),
  });

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="max-h-[80vh] w-full max-w-[520px] overflow-y-auto rounded-2xl bg-[#292a2d] shadow-2xl animate-meet-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#3c4043] px-6 py-4">
          <h2 className="text-lg font-medium text-white">Meeting summary</h2>
          <button
            id="close-summary"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full text-[#9aa0a6] hover:bg-white/10 transition-colors"
            aria-label="Close"
          >
            <CloseIcon size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-5">
          {isLoading || !summary ? (
            <div className="flex items-center justify-center py-12">
              <div className="meet-spinner" />
            </div>
          ) : (
            <div className="space-y-5">
              <p className="rounded-lg bg-[#3c4043] px-3 py-2 text-xs text-[#9aa0a6]">
                Auto-generated stats from the transcript — not an AI-written summary.
              </p>

              {/* Stats grid */}
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-[#3c4043] p-4">
                  <p className="text-xs text-[#9aa0a6] mb-1">Title</p>
                  <p className="text-sm font-medium text-white">{summary.title}</p>
                </div>
                <div className="rounded-xl bg-[#3c4043] p-4">
                  <p className="text-xs text-[#9aa0a6] mb-1">Status</p>
                  <p className="text-sm font-medium text-white">
                    <span className={`inline-flex items-center gap-1.5 ${
                      summary.status === "active" ? "text-[#81c995]" : "text-white"
                    }`}>
                      {summary.status === "active" && (
                        <span className="h-2 w-2 rounded-full bg-[#1e8e3e] animate-pulse" />
                      )}
                      {summary.status}
                    </span>
                  </p>
                </div>
                <div className="rounded-xl bg-[#3c4043] p-4">
                  <p className="text-xs text-[#9aa0a6] mb-1">Duration</p>
                  <p className="text-sm font-medium text-white">{formatDuration(summary.duration_seconds)}</p>
                </div>
                <div className="rounded-xl bg-[#3c4043] p-4">
                  <p className="text-xs text-[#9aa0a6] mb-1">Caption segments</p>
                  <p className="text-sm font-medium text-white">{summary.caption_count}</p>
                </div>
              </div>

              {/* Participants */}
              <div className="rounded-xl bg-[#3c4043] p-4">
                <p className="text-xs text-[#9aa0a6] mb-2">Participants</p>
                {summary.participant_names.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {summary.participant_names.map((name, i) => (
                      <span
                        key={i}
                        className="inline-flex items-center rounded-full bg-[#202124] px-3 py-1 text-xs text-[#e8eaed]"
                      >
                        {name}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-[#5f6368]">None yet</p>
                )}
              </div>

              {/* Languages */}
              <div className="rounded-xl bg-[#3c4043] p-4">
                <p className="text-xs text-[#9aa0a6] mb-2">Languages spoken</p>
                {summary.languages_spoken.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {summary.languages_spoken.map((lang, i) => (
                      <span
                        key={i}
                        className="inline-flex items-center rounded-full bg-[#8ab4f8]/20 px-3 py-1 text-xs text-[#8ab4f8] uppercase"
                      >
                        {lang}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-[#5f6368]">None yet</p>
                )}
              </div>

              {/* Highlights */}
              {summary.highlights.length > 0 && (
                <div className="rounded-xl bg-[#3c4043] p-4">
                  <p className="text-xs text-[#9aa0a6] mb-2">Highlights</p>
                  <ul className="space-y-2">
                    {summary.highlights.map((h, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-[#e8eaed]">
                        <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-[#8ab4f8]" />
                        {h}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
