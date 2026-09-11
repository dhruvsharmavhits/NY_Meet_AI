import { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { adminLogin, fetchMySettings, fetchTranscript, getMeeting, getMeetingAccessInfo, getQueue, joinMeeting, leaveMeeting, updateMySettings, updateProfile, uploadRecording } from "@/services/api";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useAuthStore } from "@/store/authStore";
import { NamePrompt } from "@/components/NamePrompt";
import { useMeetingRoom } from "@/meeting/useMeetingRoom";
import { useRecorder } from "@/meeting/useRecorder";
import { PreJoinLobby } from "@/meeting/PreJoinLobby";
import { VideoGrid } from "@/meeting/VideoGrid";
import { Toolbar } from "@/meeting/Toolbar";
import { ChatPanel } from "@/chat/ChatPanel";
import { ParticipantsPanel } from "@/meeting/ParticipantsPanel";
import { TranscriptPanel } from "@/meeting/TranscriptPanel";
import { QueuePanel } from "@/meeting/QueuePanel";
import { SummaryModal } from "@/meeting/SummaryModal";
import { CaptionOverlay } from "@/captions/CaptionOverlay";
import { LinguaMeetLogo } from "@/components/Icons";

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const s = Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0");
  return `${m}:${s}`;
}

function formatTime(): string {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function MeetingRoomPage() {
  const router = useRouter();
  const roomCode = typeof router.query.roomCode === "string" ? router.query.roomCode : undefined;
  const { user, loading: userLoading, register } = useCurrentUser();
  const setUser = useAuthStore((s) => s.setUser);
  const queryClient = useQueryClient();

  const [phase, setPhase] = useState<"lobby" | "call">("lobby");
  const [displayName, setDisplayName] = useState("");
  const [joinStream, setJoinStream] = useState<MediaStream | null>(null);
  const [joinMicOn, setJoinMicOn] = useState(true);
  const [joinCameraOn, setJoinCameraOn] = useState(true);

  const [chatOpen, setChatOpen] = useState(false);
  const [participantsOpen, setParticipantsOpen] = useState(false);
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const [queueOpen, setQueueOpen] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [showOriginalCaptions, setShowOriginalCaptions] = useState(false);
  const [captionsOn, setCaptionsOn] = useState(true);
  const [recordingError, setRecordingError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [currentTime, setCurrentTime] = useState(formatTime());
  const callStartRef = useRef<number | null>(null);

  const { data: meeting, isLoading } = useQuery({
    queryKey: ["meeting", roomCode],
    queryFn: () => getMeeting(roomCode as string),
    enabled: !!roomCode && !!user,
  });

  const [adminUnlocked, setAdminUnlocked] = useState(false);
  const isAdmin = adminUnlocked || (typeof window !== "undefined" && !!localStorage.getItem("admin_token"));
  const isHost = !!(user && meeting && user.id === meeting.host_id);
  const showQueue = isAdmin && isHost;
  const isPatientMode = router.query.patient === "1";
  const accessTokenParam = typeof router.query.token === "string" ? router.query.token : undefined;
  const autoJoinStartedRef = useRef(false);

  const [gatePassword, setGatePassword] = useState("");
  const [gateError, setGateError] = useState<string | null>(null);
  const [gateSubmitting, setGateSubmitting] = useState(false);

  const { data: accessInfo } = useQuery({
    queryKey: ["access-info", roomCode],
    queryFn: () => getMeetingAccessInfo(roomCode as string),
    enabled: !!roomCode && !!user,
  });

  const authorized = isHost || isAdmin || !!accessTokenParam;
  const needsAdminGate = !!accessInfo?.is_doctor_room && !authorized;

  async function handleGateSubmit(e: FormEvent) {
    e.preventDefault();
    setGateError(null);
    setGateSubmitting(true);
    try {
      const token = await adminLogin(gatePassword);
      localStorage.setItem("admin_token", token);
      setAdminUnlocked(true);
    } catch {
      setGateError("Invalid password");
    } finally {
      setGateSubmitting(false);
    }
  }

  const { data: mySettings } = useQuery({
    queryKey: ["my-settings"],
    queryFn: fetchMySettings,
    enabled: !!user,
  });

  const { data: queueForBadge } = useQuery({
    queryKey: ["queue-badge", roomCode],
    queryFn: () => getQueue(roomCode as string),
    enabled: showQueue && !!roomCode,
    refetchInterval: 5000,
  });
  const waitingCount = queueForBadge?.filter((s) => s.status === "waiting").length ?? 0;

  // Same query key as TranscriptPanel, so this shares its cache rather than
  // fetching again — it only exists so the recorder can draw the panel.
  const { data: transcriptEntries } = useQuery({
    queryKey: ["transcript", roomCode],
    queryFn: () => fetchTranscript(roomCode as string),
    enabled: transcriptOpen && !!roomCode,
    refetchInterval: 5000,
  });

  useEffect(() => {
    if (user && !displayName) setDisplayName(user.full_name);
  }, [user, displayName]);

  useEffect(() => {
    if (phase !== "call") return;
    callStartRef.current = Date.now();
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - (callStartRef.current ?? Date.now())) / 1000));
      setCurrentTime(formatTime());
    }, 1000);
    return () => clearInterval(id);
  }, [phase]);

  const {
    localStream,
    screenStream,
    remoteStreams,
    remoteScreenStreams,
    participants,
    messages,
    captions,
    micOn,
    micConnecting,
    cameraOn,
    screenSharing,
    connected,
    reconnecting,
    error,
    consultationEnded,
    joinRejected,
    sendChat,
    toggleMic,
    toggleCamera,
    toggleScreenShare,
  } = useMeetingRoom({
    roomCode,
    enabled: phase === "call" && !!user && authorized,
    initialStream: joinStream,
    initialMicOn: joinMicOn,
    initialCameraOn: joinCameraOn,
    accessToken: accessTokenParam,
  });

  const { recording, start: startRecording, stop: stopRecording } = useRecorder({
    localStream,
    remoteStreams,
    screenStream,
    remoteScreenStreams,
    localName: displayName || user?.full_name || "You",
    micOn,
    cameraOn,
    screenSharing,
    participants,
    chatOpen,
    messages,
    participantsOpen,
    captionsOn,
    captions,
    myLanguage: mySettings?.caption_language ?? "en",
    showOriginalCaptions,
    captionPosition: mySettings?.caption_position ?? "bottom",
    captionFontSize: mySettings?.caption_font_size ?? 16,
    roomCode: roomCode ?? "",
    connected,
    reconnecting,
    elapsed,
    showQueue,
    queueOpen,
    queue: queueForBadge ?? [],
    transcriptOpen,
    transcript: transcriptEntries ?? [],
  });
  const recordingRef = useRef(recording);
  recordingRef.current = recording;
  const roomCodeRef = useRef(roomCode);
  roomCodeRef.current = roomCode;

  useEffect(() => {
    return () => {
      if (recordingRef.current) {
        stopRecording().then((blob) => {
          if (blob && roomCodeRef.current) uploadRecording(roomCodeRef.current, blob).catch(() => {});
        });
      }
    };
  }, [stopRecording]);

  async function handleLobbyJoin(name: string, stream: MediaStream | null, micOnAtJoin: boolean, cameraOnAtJoin: boolean, captionLanguage: string) {
    setDisplayName(name);
    if (user && name !== user.full_name) {
      try {
        const updated = await updateProfile(name);
        setUser(updated);
      } catch {
        // best-effort — worst case the old name is used for this session
      }
    }
    if (user && captionLanguage !== mySettings?.caption_language) {
      try {
        const updatedSettings = await updateMySettings({ caption_language: captionLanguage });
        // The lobby's own PUT bypasses react-query's cache, so without this
        // the CaptionOverlay below keeps reading the stale cached language
        // for the rest of the call (it only picks up the change on the next
        // fetch, e.g. after visiting /settings and coming back).
        queryClient.setQueryData(["my-settings"], updatedSettings);
      } catch {
        // best-effort — worst case the backend keeps using the previously saved language
      }
    }
    if (roomCode) {
      try {
        await joinMeeting(roomCode);
      } catch {
        // meeting may already be active for this user; proceed regardless
      }
    }
    setJoinStream(stream);
    setJoinMicOn(micOnAtJoin);
    setJoinCameraOn(cameraOnAtJoin);
    setPhase("call");
  }

  useEffect(() => {
    if (!isPatientMode || !authorized || phase !== "lobby" || !user || !meeting || autoJoinStartedRef.current) return;
    autoJoinStartedRef.current = true;
    (async () => {
      let stream: MediaStream | null = null;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      } catch {
        stream = null;
      }
      // permission is requested up front so the tracks exist and can be
      // enabled instantly later, but mic/camera start OFF by default —
      // the patient turns them on themselves once in the call.
      stream?.getTracks().forEach((t) => (t.enabled = false));
      await handleLobbyJoin(user.full_name, stream, false, false, mySettings?.caption_language ?? "en");
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPatientMode, authorized, phase, user, meeting]);

  useEffect(() => {
    if (!consultationEnded) return;
    localStream?.getTracks().forEach((t) => t.stop());
    router.replace("/consultation-ended");
  }, [consultationEnded, localStream, router]);

  useEffect(() => {
    if (!joinRejected) return;
    localStream?.getTracks().forEach((t) => t.stop());
  }, [joinRejected, localStream]);

  async function handleToggleRecording() {
    if (!roomCode) return;
    setRecordingError(null);
    if (recording) {
      const blob = await stopRecording();
      if (blob) {
        try {
          await uploadRecording(roomCode, blob);
        } catch {
          setRecordingError("Failed to upload recording.");
        }
      }
    } else {
      try {
        await startRecording();
      } catch {
        setRecordingError("Could not start recording.");
      }
    }
  }

  async function handleLeave() {
    if (recording) {
      const blob = await stopRecording();
      if (blob && roomCode) {
        try {
          await uploadRecording(roomCode, blob);
        } catch {
          // best-effort
        }
      }
    }
    if (roomCode) {
      try {
        await leaveMeeting(roomCode);
      } catch {
        // best-effort
      }
    }
    router.push("/dashboard");
  }

  // Loading state — premium spinner with logo
  if (userLoading || (user && isLoading)) {
    return (
      <div className="flex min-h-screen items-center justify-center dark-gradient">
        <div className="flex flex-col items-center gap-6 animate-meet-fade-in">
          <div className="animate-pulse-glow rounded-2xl p-4">
            <LinguaMeetLogo size={48} />
          </div>
          <div className="meet-spinner-large" />
          <span className="text-sm font-medium text-white/40">Joining meeting...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return <NamePrompt onSubmit={register} />;
  }

  // Not found state
  if (!meeting) {
    return (
      <div className="page-gradient relative flex min-h-screen flex-col items-center justify-center gap-8 overflow-hidden">
        <div className="bg-blob bg-blob-1" />
        <div className="relative z-10 flex flex-col items-center gap-6">
          <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-[#ea4335]/10">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="#ea4335">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
            </svg>
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold text-[#1a1a2e]">Meeting not found</h1>
            <p className="mt-2 text-sm text-[#64748b]">Check the meeting code and try again</p>
          </div>
          <Link
            href="/dashboard"
            className="btn-gradient rounded-2xl px-8 py-3.5 text-sm"
          >
            Return to home
          </Link>
        </div>
      </div>
    );
  }

  // Wait for the access check before ever rendering the lobby/call for a
  // non-host, non-admin, non-invited visitor — otherwise they'd briefly see
  // the pre-join screen before the gate kicks in.
  if (!authorized && accessInfo === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center dark-gradient">
        <div className="meet-spinner-large" />
      </div>
    );
  }

  if (joinRejected) {
    return (
      <div className="page-gradient relative flex min-h-screen flex-col items-center justify-center gap-6 overflow-hidden px-4">
        <div className="bg-blob bg-blob-1" />
        <div className="relative z-10 flex flex-col items-center gap-4 text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-[#ea4335]/10">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="#ea4335">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-[#1a1a2e]">Access denied</h1>
          <p className="max-w-sm text-sm text-[#64748b]">
            You're not authorized to join this meeting. Use the personal link your doctor sent you, or sign in as the host.
          </p>
        </div>
      </div>
    );
  }

  if (needsAdminGate) {
    return (
      <div className="page-gradient relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-4">
        <div className="bg-blob bg-blob-1" />
        <div className="bg-blob bg-blob-2" />
        <div className="relative z-10 w-full max-w-[420px] animate-meet-fade-in">
          <div className="glass-card rounded-3xl px-10 py-12 glow-blue">
            <div className="mb-8 flex flex-col items-center gap-4">
              <LinguaMeetLogo size={48} />
              <div className="text-center">
                <h1 className="text-2xl font-bold text-[#1a1a2e]">Admin access required</h1>
                <p className="mt-1 text-sm text-[#64748b]">
                  This is a private room. Enter the admin password, or use your personal invite link.
                </p>
              </div>
            </div>

            {gateError && (
              <div className="mb-5 flex items-center gap-2 rounded-2xl bg-[#ea4335]/8 px-4 py-3 text-sm text-[#ea4335]">
                {gateError}
              </div>
            )}

            <form onSubmit={handleGateSubmit} className="space-y-5">
              <input
                id="meeting-admin-password-input"
                type="password"
                required
                autoFocus
                value={gatePassword}
                onChange={(e) => setGatePassword(e.target.value)}
                placeholder="Admin password"
                className="input-modern w-full"
              />
              <button
                id="meeting-admin-gate-submit"
                type="submit"
                disabled={gateSubmitting || !gatePassword}
                className="btn-gradient w-full rounded-2xl py-4 text-base"
              >
                {gateSubmitting ? "Signing in..." : "Sign in"}
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  // Pre-join lobby
  if (phase === "lobby") {
    if (isPatientMode) {
      return (
        <div className="flex min-h-screen items-center justify-center dark-gradient">
          <div className="flex flex-col items-center gap-6 animate-meet-fade-in">
            <div className="animate-pulse-glow rounded-2xl p-4">
              <LinguaMeetLogo size={48} />
            </div>
            <div className="meet-spinner-large" />
            <span className="text-sm font-medium text-white/40">Joining your consultation...</span>
          </div>
        </div>
      );
    }
    return (
      <PreJoinLobby
        meetingTitle={meeting.title}
        roomCode={meeting.room_code}
        defaultName={displayName || user?.full_name || "Guest"}
        defaultCaptionLanguage={mySettings?.caption_language ?? "en"}
        onJoin={handleLobbyJoin}
      />
    );
  }

  // In-call view
  return (
    <div className="flex h-screen flex-col dark-gradient">
      {/* Top header bar — glassmorphism */}
      <header className="flex items-center justify-between px-4 py-2" style={{ background: "rgba(15,12,41,0.5)", backdropFilter: "blur(12px)" }}>
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-white/60">{currentTime}</span>
          <div className="flex items-center gap-2 rounded-xl bg-white/8 px-3.5 py-1.5 backdrop-blur-sm">
            <span className="text-xs font-semibold text-white/80">{meeting.room_code}</span>
          </div>
          {recording && (
            <div className="flex items-center gap-2 rounded-xl bg-[#ea4335]/15 px-3.5 py-1.5">
              <span className="h-2 w-2 rounded-full bg-[#ea4335] animate-pulse" />
              <span className="text-xs font-bold text-[#ff6b6b]">REC</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          {!connected && (
            <span className="flex items-center gap-2 rounded-xl bg-[#f4b400]/15 px-3.5 py-1.5 text-xs font-medium text-[#fbbf24]">
              <div className="h-2 w-2 animate-spin rounded-full border border-[#fbbf24] border-t-transparent" />
              {reconnecting ? "Reconnecting..." : "Connecting..."}
            </span>
          )}
          <span className="text-xs font-medium text-white/40">{formatDuration(elapsed)}</span>
          <div
            className="flex h-9 w-9 items-center justify-center rounded-xl text-xs font-bold text-white"
            style={{ background: "linear-gradient(135deg, #7c3aed, #4285f4)" }}
          >
            {displayName?.charAt(0)?.toUpperCase() || "U"}
          </div>
        </div>
      </header>

      {/* Error banner */}
      {(error || recordingError) && (
        <div className="mx-3 mb-2 flex items-center gap-2 rounded-2xl px-5 py-3 text-sm text-[#ff6b6b] animate-meet-fade-in" style={{ background: "rgba(234,67,53,0.1)", backdropFilter: "blur(8px)" }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="#ff6b6b">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
          </svg>
          {error ?? recordingError}
        </div>
      )}

      {/* Main content area */}
      <div className="relative flex flex-1 overflow-hidden">
        {/* Video grid */}
        <VideoGrid
          localStream={localStream}
          screenStream={screenStream}
          localName={displayName || "You"}
          micOn={micOn}
          cameraOn={cameraOn}
          screenSharing={screenSharing}
          remoteStreams={remoteStreams}
          remoteScreenStreams={remoteScreenStreams}
          participants={participants}
        />

        {/* Caption overlay */}
        {captionsOn && (
          <CaptionOverlay
            captions={captions}
            myLanguage={mySettings?.caption_language ?? "en"}
            position={mySettings?.caption_position ?? "bottom"}
            showOriginal={showOriginalCaptions}
            fontSize={mySettings?.caption_font_size ?? 16}
          />
        )}

        {/* Side panels */}
        {chatOpen && <ChatPanel messages={messages} onSend={sendChat} onClose={() => setChatOpen(false)} />}
        {participantsOpen && (
          <ParticipantsPanel
            localName={displayName || "You"}
            localMicOn={micOn}
            localCameraOn={cameraOn}
            participants={participants}
            onClose={() => setParticipantsOpen(false)}
          />
        )}
        {transcriptOpen && roomCode && (
          <TranscriptPanel roomCode={roomCode} onClose={() => setTranscriptOpen(false)} />
        )}
        {queueOpen && showQueue && roomCode && (
          <QueuePanel roomCode={roomCode} onClose={() => setQueueOpen(false)} />
        )}
      </div>

      {/* Summary modal */}
      {summaryOpen && roomCode && <SummaryModal roomCode={roomCode} onClose={() => setSummaryOpen(false)} />}

      {/* Bottom toolbar */}
      <Toolbar
        micOn={micOn}
        cameraOn={cameraOn}
        screenSharing={screenSharing}
        chatOpen={chatOpen}
        participantsOpen={participantsOpen}
        transcriptOpen={transcriptOpen}
        showQueue={showQueue}
        queueBadge={waitingCount > 0 ? waitingCount : undefined}
        queueOpen={queueOpen}
        onToggleQueue={() => {
          setQueueOpen((v) => {
            if (!v) { setChatOpen(false); setParticipantsOpen(false); setTranscriptOpen(false); }
            return !v;
          });
        }}
        showOriginalCaptions={showOriginalCaptions}
        captionsOn={captionsOn}
        recording={recording}
        participantCount={Object.keys(participants).length + 1}
        micConnecting={micConnecting}
        onToggleMic={toggleMic}
        onToggleCamera={toggleCamera}
        onToggleScreenShare={toggleScreenShare}
        onToggleChat={() => {
          setChatOpen((v) => {
            if (!v) { setParticipantsOpen(false); setTranscriptOpen(false); setQueueOpen(false); }
            return !v;
          });
        }}
        onToggleParticipants={() => {
          setParticipantsOpen((v) => {
            if (!v) { setChatOpen(false); setTranscriptOpen(false); setQueueOpen(false); }
            return !v;
          });
        }}
        onToggleTranscript={() => {
          setTranscriptOpen((v) => {
            if (!v) { setChatOpen(false); setParticipantsOpen(false); setQueueOpen(false); }
            return !v;
          });
        }}
        onToggleCaptions={() => setCaptionsOn((v) => !v)}
        onToggleCaptionMode={() => setShowOriginalCaptions((v) => !v)}
        onToggleRecording={handleToggleRecording}
        onShowSummary={() => setSummaryOpen(true)}
        onLeave={handleLeave}
      />
    </div>
  );
}
