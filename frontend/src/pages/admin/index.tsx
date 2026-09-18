import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  admitSession,
  completeSession,
  createDoctorRoom,
  createPatientLink,
  downloadRecording,
  fetchSessionTranscript,
  getQueue,
  listDoctorRooms,
  listPatientLinks,
  listRecordings,
  Meeting,
} from "@/services/api";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { NamePrompt } from "@/components/NamePrompt";
import { ContentCopyIcon, DownloadIcon, LinguaMeetLogo, VideoCallIcon } from "@/components/Icons";

function statusBadge(status: string) {
  const map: Record<string, string> = {
    waiting: "bg-[#f4b400]/10 text-[#b45309]",
    active: "bg-[#0f9d58]/10 text-[#0f9d58]",
    completed: "bg-[#64748b]/10 text-[#64748b]",
  };
  return `inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${map[status] ?? map.completed}`;
}

export default function AdminDashboardPage() {
  const router = useRouter();
  const { user, loading, register } = useCurrentUser();
  const queryClient = useQueryClient();

  const [ready, setReady] = useState(false);
  const [newRoomTitle, setNewRoomTitle] = useState("");
  const [selectedRoomCode, setSelectedRoomCode] = useState<string | null>(null);
  const [newLinkLabel, setNewLinkLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [downloadErrorId, setDownloadErrorId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  useEffect(() => {
    if (!localStorage.getItem("admin_token")) {
      router.replace("/admin/login");
      return;
    }
    setReady(true);
  }, [router]);

  const { data: rooms } = useQuery({
    queryKey: ["doctor-rooms"],
    queryFn: listDoctorRooms,
    enabled: ready && !!user,
  });

  const selectedRoom = rooms?.find((r) => r.room_code === selectedRoomCode) ?? rooms?.[0] ?? null;

  const { data: links } = useQuery({
    queryKey: ["patient-links", selectedRoom?.room_code],
    queryFn: () => listPatientLinks(selectedRoom!.room_code),
    enabled: !!selectedRoom,
    refetchInterval: 5000,
  });

  const { data: queue } = useQuery({
    queryKey: ["queue", selectedRoom?.room_code],
    queryFn: () => getQueue(selectedRoom!.room_code),
    enabled: !!selectedRoom,
    refetchInterval: 4000,
  });

  const { data: recordings } = useQuery({
    queryKey: ["recordings", selectedRoom?.room_code],
    queryFn: () => listRecordings(selectedRoom!.room_code),
    enabled: !!selectedRoom,
    refetchInterval: 10000,
  });

  const [downloadingRecording, setDownloadingRecording] = useState<string | null>(null);

  async function handleDownloadRoomRecording(filename: string) {
    if (!selectedRoom) return;
    setDownloadingRecording(filename);
    try {
      await downloadRecording(selectedRoom.room_code, filename);
    } finally {
      setDownloadingRecording(null);
    }
  }

  async function handleCreateRoom(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const title = newRoomTitle.trim();
    if (!title) return;
    try {
      const room = await createDoctorRoom(title);
      setNewRoomTitle("");
      queryClient.invalidateQueries({ queryKey: ["doctor-rooms"] });
      setSelectedRoomCode(room.room_code);
    } catch {
      setError("Could not create room");
    }
  }

  async function handleCreateLink(e: FormEvent) {
    e.preventDefault();
    if (!selectedRoom) return;
    const name = newLinkLabel.trim();
    if (!name) return;
    setError(null);
    try {
      await createPatientLink(selectedRoom.room_code, name);
      setNewLinkLabel("");
      queryClient.invalidateQueries({ queryKey: ["patient-links", selectedRoom.room_code] });
    } catch {
      setError("Could not create patient link");
    }
  }

  async function handleAdmit(sessionId: string) {
    if (!selectedRoom) return;
    setError(null);
    try {
      await admitSession(sessionId);
      queryClient.invalidateQueries({ queryKey: ["queue", selectedRoom.room_code] });
      queryClient.invalidateQueries({ queryKey: ["patient-links", selectedRoom.room_code] });
    } catch {
      setError("Could not admit patient (another patient may already be active)");
    }
  }

  async function handleComplete(sessionId: string) {
    if (!selectedRoom) return;
    setError(null);
    try {
      await completeSession(sessionId);
      queryClient.invalidateQueries({ queryKey: ["queue", selectedRoom.room_code] });
      queryClient.invalidateQueries({ queryKey: ["patient-links", selectedRoom.room_code] });
    } catch {
      setError("Could not complete consultation");
    }
  }

  async function handleDownloadTranscript(sessionId: string) {
    setDownloadErrorId(null);
    setDownloadingId(`t-${sessionId}`);
    try {
      const entries = await fetchSessionTranscript(sessionId);
      if (entries.length === 0) {
        setDownloadErrorId(`t-${sessionId}`);
        return;
      }
      const lines = entries.map(
        (e) => `[${new Date(e.created_at).toLocaleTimeString()}] ${e.speaker_name} (${e.lang}): ${e.text}`
      );
      const blob = new Blob([lines.join("\n")], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `transcript-${sessionId}.txt`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      setDownloadErrorId(`t-${sessionId}`);
    } finally {
      setDownloadingId(null);
    }
  }

  function copyLink(code: string) {
    const url = `${window.location.origin}/p/${code}`;
    navigator.clipboard?.writeText(url).catch(() => {});
  }

  if (!ready || loading) {
    return (
      <div className="page-gradient flex min-h-screen items-center justify-center">
        <div className="meet-spinner-large" />
      </div>
    );
  }

  if (!user) {
    return <NamePrompt onSubmit={register} />;
  }

  const waiting = queue?.filter((s) => s.status === "waiting") ?? [];
  const active = queue?.find((s) => s.status === "active") ?? null;

  return (
    <div className="page-gradient relative overflow-hidden">
      <div className="bg-blob bg-blob-1" />
      <div className="bg-blob bg-blob-2" />

      <header className="glass-header sticky top-0 z-20 flex items-center justify-between px-5 py-3 sm:px-8">
        <div className="flex items-center gap-3">
          <LinguaMeetLogo size={36} />
          <span className="text-xl font-bold text-[#1a1a2e] tracking-tight">Admin</span>
        </div>
      </header>

      <main className="relative z-10 mx-auto flex max-w-[1100px] flex-col gap-8 px-6 py-10">
        {error && (
          <div className="glass-card flex items-center gap-2 rounded-2xl px-5 py-3 text-sm text-[#ea4335]">
            {error}
          </div>
        )}

        <section className="glass-card rounded-3xl p-6">
          <h2 className="mb-4 text-xs font-bold text-[#94a3b8] uppercase tracking-[0.15em]">
            Doctor / provider rooms
          </h2>

          <form onSubmit={handleCreateRoom} className="mb-5 flex gap-3">
            <input
              value={newRoomTitle}
              onChange={(e) => setNewRoomTitle(e.target.value)}
              placeholder="New room title"
              className="input-modern flex-1"
            />
            <button type="submit" disabled={!newRoomTitle.trim()} className="btn-gradient rounded-xl px-6 py-3 text-sm">
              Create room
            </button>
          </form>

          <div className="flex flex-wrap gap-3">
            {rooms?.map((room: Meeting) => (
              <button
                key={room.id}
                onClick={() => setSelectedRoomCode(room.room_code)}
                className={`flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium transition-all duration-200 ${
                  selectedRoom?.room_code === room.room_code
                    ? "border-[#4285f4] bg-[#4285f4]/10 text-[#4285f4]"
                    : "border-black/10 text-[#64748b] hover:bg-black/5"
                }`}
              >
                <VideoCallIcon size={16} />
                {room.title}
              </button>
            ))}
          </div>
        </section>

        {selectedRoom && (
          <>
            <section className="glass-card rounded-3xl p-6">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-xs font-bold text-[#94a3b8] uppercase tracking-[0.15em]">
                  Private room link
                </h2>
                <Link href={`/meeting/${selectedRoom.room_code}`} className="text-sm font-semibold text-[#4285f4] hover:underline" target="_blank" rel="noopener noreferrer">
                  Open persistent room
                </Link>
              </div>
              <p className="text-sm text-[#1a1a2e] font-medium">/meeting/{selectedRoom.room_code}</p>
            </section>

            <section className="glass-card rounded-3xl p-6">
              <h2 className="mb-4 text-xs font-bold text-[#94a3b8] uppercase tracking-[0.15em]">
                Patient links
              </h2>
              <form onSubmit={handleCreateLink} className="mb-5 flex gap-3">
                <input
                  value={newLinkLabel}
                  onChange={(e) => setNewLinkLabel(e.target.value)}
                  placeholder="Patient name"
                  required
                  className="input-modern flex-1"
                />
                <button type="submit" disabled={!newLinkLabel.trim()} className="btn-gradient rounded-xl px-6 py-3 text-sm disabled:opacity-40">
                  Create patient link
                </button>
              </form>

              <div className="divide-y divide-black/5">
                {links?.map(({ link, session }) => (
                  <div key={link.id} className="flex items-center justify-between py-3">
                    <div>
                      <p className="text-sm font-semibold text-[#1a1a2e]">
                        {session?.patient_name ?? link.label ?? "Unclaimed link"}
                      </p>
                      <p className="text-xs text-[#94a3b8] font-medium">/p/{link.code}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      {session && (
                        <span className={statusBadge(session.status)}>
                          {session.status === "waiting" ? `Waiting #${session.queue_position}` : session.status}
                        </span>
                      )}
                      <button
                        onClick={() => copyLink(link.code)}
                        title="Copy patient link"
                        className="flex h-9 w-9 items-center justify-center rounded-xl text-[#64748b] hover:bg-black/5 transition-all duration-200"
                      >
                        <ContentCopyIcon size={16} />
                      </button>
                    </div>
                  </div>
                ))}
                {links?.length === 0 && <p className="py-4 text-sm text-[#94a3b8]">No patient links yet</p>}
              </div>
            </section>

            <section className="glass-card rounded-3xl p-6">
              <h2 className="mb-4 text-xs font-bold text-[#94a3b8] uppercase tracking-[0.15em]">Queue</h2>

              {active && (
                <div className="mb-4 flex items-center justify-between rounded-2xl bg-[#0f9d58]/8 px-5 py-4">
                  <div>
                    <p className="text-sm font-semibold text-[#1a1a2e]">{active.patient_name}</p>
                    <span className={statusBadge("active")}>Current patient</span>
                  </div>
                  <button
                    onClick={() => handleComplete(active.id)}
                    className="rounded-xl bg-[#ea4335] px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90 transition-all duration-200"
                  >
                    Complete consultation
                  </button>
                </div>
              )}

              <div className="divide-y divide-black/5">
                {waiting.map((s) => (
                  <div key={s.id} className="flex items-center justify-between py-3">
                    <div>
                      <p className="text-sm font-semibold text-[#1a1a2e]">{s.patient_name}</p>
                      <span className={statusBadge("waiting")}>Waiting #{s.queue_position}</span>
                    </div>
                    <button
                      onClick={() => handleAdmit(s.id)}
                      disabled={!!active}
                      className="btn-gradient rounded-xl px-5 py-2.5 text-sm disabled:opacity-40"
                    >
                      Admit
                    </button>
                  </div>
                ))}
                {waiting.length === 0 && <p className="py-4 text-sm text-[#94a3b8]">No patients waiting</p>}
              </div>
            </section>

            <section className="glass-card rounded-3xl p-6">
              <h2 className="mb-4 text-xs font-bold text-[#94a3b8] uppercase tracking-[0.15em]">Recordings</h2>
              <div className="divide-y divide-black/5">
                {recordings?.map((filename, i) => (
                  <div key={filename} className="flex items-center justify-between py-3">
                    <p className="text-sm font-semibold text-[#1a1a2e]">Recording {i + 1}</p>
                    <button
                      onClick={() => handleDownloadRoomRecording(filename)}
                      disabled={downloadingRecording === filename}
                      className="flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium text-[#64748b] hover:bg-black/5 disabled:opacity-40 transition-all duration-200"
                    >
                      <DownloadIcon size={16} />
                      Download
                    </button>
                  </div>
                ))}
                {recordings?.length === 0 && <p className="py-4 text-sm text-[#94a3b8]">No recordings yet</p>}
              </div>
            </section>

            <section className="glass-card overflow-hidden rounded-3xl">
              <h2 className="px-6 pt-6 text-xs font-bold text-[#94a3b8] uppercase tracking-[0.15em]">
                Consultation history
              </h2>
              <div className="mt-4 divide-y divide-black/5">
                {links
                  ?.filter((l) => l.session)
                  .map(({ link, session }) => (
                    <div key={link.id} className="flex items-center justify-between px-6 py-4">
                      <div>
                        <p className="text-sm font-semibold text-[#1a1a2e]">{session!.patient_name}</p>
                        <span className={statusBadge(session!.status)}>{session!.status}</span>
                        {downloadErrorId === `t-${session!.id}` && (
                          <p className="mt-0.5 text-xs font-medium text-[#ea4335]">No transcript available</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleDownloadTranscript(session!.id)}
                          disabled={downloadingId === `t-${session!.id}`}
                          className="flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium text-[#64748b] hover:bg-black/5 disabled:opacity-40 transition-all duration-200"
                        >
                          <DownloadIcon size={16} />
                          Transcript
                        </button>
                      </div>
                    </div>
                  ))}
                {links?.filter((l) => l.session).length === 0 && (
                  <p className="px-6 pb-6 text-sm text-[#94a3b8]">No consultations yet</p>
                )}
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
