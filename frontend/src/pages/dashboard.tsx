import { FormEvent, MouseEvent, useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createMeeting, listMeetings, fetchTranscript, updateMeetingTitle } from "@/services/api";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { NamePrompt } from "@/components/NamePrompt";
import { LinguaMeetLogo, VideoCallIcon, KeyboardIcon, SettingsIcon, DownloadIcon, EditIcon } from "@/components/Icons";

interface TitleModalState {
  mode: "create" | "rename";
  roomCode?: string;
  value: string;
}

export default function DashboardPage() {
  const router = useRouter();
  const { user, loading, register } = useCurrentUser();
  const queryClient = useQueryClient();

  const [joinCode, setJoinCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [downloadingCode, setDownloadingCode] = useState<string | null>(null);
  const [downloadErrorCode, setDownloadErrorCode] = useState<string | null>(null);
  const [titleModal, setTitleModal] = useState<TitleModalState | null>(null);
  const [savingTitle, setSavingTitle] = useState(false);
  const [titleError, setTitleError] = useState<string | null>(null);

  const { data: meetings } = useQuery({
    queryKey: ["meetings"],
    queryFn: listMeetings,
    enabled: !!user,
  });

  async function handleTitleModalSubmit(e: FormEvent) {
    e.preventDefault();
    if (!titleModal) return;
    const title = titleModal.value.trim();
    if (!title) return;
    setTitleError(null);
    setSavingTitle(true);
    try {
      if (titleModal.mode === "create") {
        const meeting = await createMeeting(title);
        queryClient.invalidateQueries({ queryKey: ["meetings"] });
        setTitleModal(null);
        router.push(`/meeting/${meeting.room_code}`);
      } else if (titleModal.roomCode) {
        await updateMeetingTitle(titleModal.roomCode, title);
        queryClient.invalidateQueries({ queryKey: ["meetings"] });
        setTitleModal(null);
      }
    } catch {
      setTitleError(titleModal.mode === "create" ? "Could not create meeting" : "Could not rename meeting");
    } finally {
      setSavingTitle(false);
    }
  }

  async function handleDownloadTranscript(e: MouseEvent, roomCode: string) {
    e.preventDefault();
    e.stopPropagation();
    setDownloadErrorCode(null);
    setDownloadingCode(roomCode);
    try {
      const entries = await fetchTranscript(roomCode);
      if (entries.length === 0) {
        setDownloadErrorCode(roomCode);
        return;
      }
      const lines = entries.map(
        (entry) => `[${new Date(entry.created_at).toLocaleTimeString()}] ${entry.speaker_name} (${entry.lang}): ${entry.text}`
      );
      const blob = new Blob([lines.join("\n")], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `transcript-${roomCode}.txt`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      setDownloadErrorCode(roomCode);
    } finally {
      setDownloadingCode(null);
    }
  }

  function handleJoin(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const code = joinCode.trim();
    if (!code) return;
    router.push(`/meeting/${code}`);
  }

  if (loading) {
    return (
      <div className="page-gradient flex min-h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="meet-spinner-large" />
          <span className="text-sm font-medium text-[#64748b]">Loading...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return <NamePrompt onSubmit={register} />;
  }

  return (
    <div className="page-gradient relative overflow-hidden">
      {/* Background blobs */}
      <div className="bg-blob bg-blob-1" />
      <div className="bg-blob bg-blob-2" />
      <div className="bg-blob bg-blob-3" />

      {/* Header */}
      <header className="glass-header sticky top-0 z-20 flex items-center justify-between px-5 py-3 sm:px-8">
        <div className="flex items-center gap-3">
          <LinguaMeetLogo size={36} />
          <span className="text-xl font-bold text-[#1a1a2e] tracking-tight">
            LinguaMeet
          </span>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/settings"
            id="settings-button"
            className="flex h-10 w-10 items-center justify-center rounded-xl text-[#64748b] hover:bg-black/5 transition-all duration-200"
            aria-label="Settings"
          >
            <SettingsIcon size={20} />
          </Link>
          {user && (
            <div
              className="flex h-10 w-10 items-center justify-center rounded-xl text-sm font-bold text-white shadow-md"
              style={{ background: "linear-gradient(135deg, #4285f4, #7c3aed)" }}
            >
              {user.full_name?.charAt(0)?.toUpperCase() || "U"}
            </div>
          )}
        </div>
      </header>

      {/* Main content */}
      <main className="relative z-10 mx-auto flex max-w-[1100px] flex-col items-center px-6 py-16 sm:py-24">
        {/* Hero section */}
        <div className="flex w-full flex-col items-center gap-14 sm:flex-row sm:items-center sm:justify-between">
          {/* Left: Text + Actions */}
          <div className="max-w-[540px] text-center sm:text-left animate-meet-fade-in">
            <h1 className="text-[3rem] font-extrabold leading-[1.1] tracking-tight text-[#1a1a2e] sm:text-[3.5rem]">
              Video calls for{" "}
              <span className="bg-gradient-to-r from-[#4285f4] via-[#7c3aed] to-[#00c4cc] bg-clip-text text-transparent">
                everyone
              </span>
            </h1>
            <p className="mt-5 text-lg text-[#64748b] leading-relaxed">
              Live translated captions, chat, and screen sharing — connect with anyone, in any language.
            </p>

            {error && (
              <div className="mt-5 glass-card flex items-center gap-2 rounded-2xl px-5 py-3 text-sm text-[#ea4335]">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="#ea4335">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
                </svg>
                {error}
              </div>
            )}

            <div className="mt-10 flex flex-col gap-4 sm:flex-row sm:items-center">
              <button
                id="new-meeting-button"
                onClick={() => {
                  setTitleError(null);
                  setTitleModal({ mode: "create", value: "Untitled meeting" });
                }}
                className="btn-gradient flex items-center justify-center gap-3 rounded-2xl px-8 py-4 text-base"
              >
                <VideoCallIcon size={22} />
                New meeting
              </button>

              <form onSubmit={handleJoin} className="flex items-center gap-2">
                <div className="relative flex items-center">
                  <KeyboardIcon size={18} className="absolute left-4 text-[#94a3b8]" />
                  <input
                    id="join-code-input"
                    value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value)}
                    placeholder="Enter a code or link"
                    className="input-modern w-[230px] pl-11"
                  />
                </div>
                <button
                  id="join-meeting-button"
                  type="submit"
                  disabled={!joinCode.trim()}
                  className="rounded-xl px-5 py-3.5 text-sm font-semibold text-[#4285f4] hover:bg-[#4285f4]/10 disabled:text-[#94a3b8] disabled:hover:bg-transparent transition-all duration-200"
                >
                  Join
                </button>
              </form>
            </div>
          </div>

          {/* Right: Abstract illustration */}
          <div className="hidden sm:flex items-center justify-center animate-meet-fade-in" style={{ animationDelay: "0.15s" }}>
            <div className="relative flex h-[300px] w-[340px] items-center justify-center">
              {/* Decorative circles */}
              <div className="absolute inset-0 rounded-full opacity-30" style={{ background: "radial-gradient(circle, rgba(66,133,244,0.2) 0%, transparent 70%)" }} />

              <div className="relative flex flex-col items-center gap-5">
                <div className="flex gap-4">
                  <div className="animate-float flex h-[110px] w-[110px] items-center justify-center rounded-3xl shadow-xl" style={{ background: "linear-gradient(135deg, #4285f4, #34a0f4)", animationDelay: "0s" }}>
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="white">
                      <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z" />
                    </svg>
                  </div>
                  <div className="animate-float flex h-[110px] w-[110px] items-center justify-center rounded-3xl shadow-xl" style={{ background: "linear-gradient(135deg, #0f9d58, #34d399)", animationDelay: "0.5s" }}>
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="white">
                      <path d="M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z" />
                    </svg>
                  </div>
                </div>
                <div className="animate-float flex h-[110px] w-[110px] items-center justify-center rounded-3xl shadow-xl" style={{ background: "linear-gradient(135deg, #f4b400, #fbbf24)", animationDelay: "1s" }}>
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="white">
                    <path d="M12.87 15.07l-2.54-2.51.03-.03A17.52 17.52 0 0014.07 6H17V4h-7V2H8v2H1v1.99h11.17C11.5 7.92 10.44 9.75 9 11.35 8.07 10.32 7.3 9.19 6.69 8h-2c.73 1.63 1.73 3.17 2.98 4.56l-5.09 5.02L4 19l5-5 3.11 3.11.76-2.04zM18.5 10h-2L12 22h2l1.12-3h4.75L21 22h2l-4.5-12zm-2.62 7l1.62-4.33L19.12 17h-3.24z" />
                  </svg>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Recent meetings */}
        {meetings && meetings.length > 0 && (
          <section className="mt-20 w-full animate-meet-slide-up">
            <h2 className="mb-5 text-xs font-bold text-[#94a3b8] uppercase tracking-[0.15em]">
              Your meetings
            </h2>
            <div className="glass-card overflow-hidden rounded-3xl">
              {meetings.map((m, idx) => (
                <div
                  key={m.id}
                  id={`meeting-${m.room_code}`}
                  onClick={() => router.push(`/meeting/${m.room_code}`)}
                  role="link"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") router.push(`/meeting/${m.room_code}`);
                  }}
                  className={`flex cursor-pointer items-center justify-between px-6 py-5 hover:bg-white/40 transition-all duration-200 ${
                    idx !== meetings.length - 1 ? "border-b border-black/5" : ""
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <div
                      className="flex h-11 w-11 items-center justify-center rounded-xl shadow-sm"
                      style={{ background: "linear-gradient(135deg, #4285f4, #7c3aed)" }}
                    >
                      <VideoCallIcon size={20} className="text-white" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-[#1a1a2e]">{m.title}</p>
                      <p className="text-xs text-[#94a3b8] font-medium">{m.room_code}</p>
                      {downloadErrorCode === m.room_code && (
                        <p className="mt-0.5 text-xs font-medium text-[#ea4335]">
                          No transcript available
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${
                      m.status === "active"
                        ? "bg-[#0f9d58]/10 text-[#0f9d58]"
                        : "bg-[#64748b]/10 text-[#64748b]"
                    }`}>
                      {m.status === "active" && (
                        <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-[#0f9d58] animate-pulse" />
                      )}
                      {m.status}
                    </span>
                    <button
                      id={`rename-meeting-${m.room_code}`}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setTitleError(null);
                        setTitleModal({ mode: "rename", roomCode: m.room_code, value: m.title });
                      }}
                      aria-label={`Rename ${m.title}`}
                      title="Rename meeting"
                      className="flex h-9 w-9 items-center justify-center rounded-xl text-[#64748b] hover:bg-black/5 hover:text-[#4285f4] transition-all duration-200"
                    >
                      <EditIcon size={16} />
                    </button>
                    <button
                      id={`download-transcript-${m.room_code}`}
                      onClick={(e) => handleDownloadTranscript(e, m.room_code)}
                      disabled={downloadingCode === m.room_code}
                      aria-label={`Download transcript for ${m.title}`}
                      title="Download transcript"
                      className="flex h-9 w-9 items-center justify-center rounded-xl text-[#64748b] hover:bg-black/5 hover:text-[#4285f4] disabled:opacity-40 transition-all duration-200"
                    >
                      {downloadingCode === m.room_code ? (
                        <span
                          className="block h-4 w-4 rounded-full"
                          style={{
                            border: "2px solid rgba(66, 133, 244, 0.15)",
                            borderTopColor: "#4285f4",
                            animation: "meet-spin 0.8s linear infinite",
                          }}
                        />
                      ) : (
                        <DownloadIcon size={18} />
                      )}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>

      {titleModal && (
        <div
          className="fixed inset-0 z-30 flex items-center justify-center bg-black/40 p-4"
          onClick={() => !savingTitle && setTitleModal(null)}
        >
          <div
            className="glass-card w-full max-w-[420px] rounded-3xl px-8 py-8 animate-meet-scale-in"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold text-[#1a1a2e]">
              {titleModal.mode === "create" ? "New meeting" : "Rename meeting"}
            </h2>

            {titleError && (
              <div className="mt-4 flex items-center gap-2 rounded-2xl bg-[#ea4335]/8 px-4 py-3 text-sm text-[#ea4335]">
                {titleError}
              </div>
            )}

            <form onSubmit={handleTitleModalSubmit} className="mt-5">
              <input
                id="meeting-title-input"
                required
                autoFocus
                value={titleModal.value}
                onChange={(e) => setTitleModal({ ...titleModal, value: e.target.value })}
                placeholder="Meeting title"
                className="input-modern w-full"
              />

              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setTitleModal(null)}
                  disabled={savingTitle}
                  className="rounded-xl px-5 py-3 text-sm font-semibold text-[#64748b] hover:bg-black/5 transition-all duration-200"
                >
                  Cancel
                </button>
                <button
                  id="save-meeting-title"
                  type="submit"
                  disabled={savingTitle || !titleModal.value.trim()}
                  className="btn-gradient rounded-xl px-6 py-3 text-sm"
                >
                  {savingTitle ? "Saving..." : titleModal.mode === "create" ? "Create" : "Save"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
