import { useQuery, useQueryClient } from "@tanstack/react-query";
import { admitSession, completeSession, getQueue } from "@/services/api";
import { CloseIcon } from "@/components/Icons";

interface QueuePanelProps {
  roomCode: string;
  onClose: () => void;
}

export function QueuePanel({ roomCode, onClose }: QueuePanelProps) {
  const queryClient = useQueryClient();

  const { data: queue, isLoading } = useQuery({
    queryKey: ["queue", roomCode],
    queryFn: () => getQueue(roomCode),
    refetchInterval: 4000,
  });

  const waiting = queue?.filter((s) => s.status === "waiting") ?? [];
  const active = queue?.find((s) => s.status === "active") ?? null;

  async function handleAdmit(sessionId: string) {
    try {
      await admitSession(sessionId);
      queryClient.invalidateQueries({ queryKey: ["queue", roomCode] });
    } catch {
      // best-effort — backend refuses if another patient is already active
    }
  }

  async function handleComplete(sessionId: string) {
    try {
      await completeSession(sessionId);
      queryClient.invalidateQueries({ queryKey: ["queue", roomCode] });
    } catch {
      // best-effort
    }
  }

  return (
    <div
      className="flex w-[360px] flex-col panel-slide-enter"
      style={{ background: "rgba(15, 12, 41, 0.85)", backdropFilter: "blur(24px)", borderLeft: "1px solid rgba(255,255,255,0.06)" }}
    >
      <div className="flex items-center justify-between px-5 py-4">
        <h2 className="text-base font-bold text-white">Patient queue</h2>
        <button
          id="close-queue"
          onClick={onClose}
          className="flex h-9 w-9 items-center justify-center rounded-xl text-white/50 hover:bg-white/10 transition-all duration-200"
          aria-label="Close"
        >
          <CloseIcon size={18} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-5">
        {isLoading && (
          <div className="flex items-center justify-center py-16">
            <div className="meet-spinner" />
          </div>
        )}

        {!isLoading && active && (
          <div className="mb-5 rounded-2xl bg-[#0f9d58]/15 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#81c995]">Current patient</p>
            <p className="mt-1 text-sm font-semibold text-white">{active.patient_name}</p>
            <button
              id="complete-consultation"
              onClick={() => handleComplete(active.id)}
              className="mt-3 w-full rounded-xl bg-[#ea4335] px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 transition-all duration-200"
            >
              Complete consultation
            </button>
          </div>
        )}

        {!isLoading && waiting.length === 0 && (
          <p className="py-6 text-center text-sm text-white/30">No patients waiting</p>
        )}

        {waiting.map((s) => (
          <div key={s.id} className="mb-3 flex items-center justify-between rounded-2xl bg-white/5 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-white">{s.patient_name}</p>
              <p className="text-xs text-white/40">Waiting #{s.queue_position}</p>
            </div>
            <button
              id={`admit-${s.id}`}
              onClick={() => handleAdmit(s.id)}
              disabled={!!active}
              className="btn-gradient rounded-xl px-4 py-2 text-xs disabled:opacity-40"
            >
              Admit
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
