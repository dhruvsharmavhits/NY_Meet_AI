import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { fetchMySettings, getMeeting, joinMeeting, leaveMeeting, updateMySettings, updateProfile, uploadRecording } from "@/services/api";
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

  const { data: mySettings } = useQuery({
    queryKey: ["my-settings"],
    queryFn: fetchMySettings,
    enabled: !!user,
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
    cameraOn,
    screenSharing,
    connected,
    reconnecting,
    error,
    sendChat,
    toggleMic,
    toggleCamera,
    toggleScreenShare,
  } = useMeetingRoom({
    roomCode,
    enabled: phase === "call" && !!user,
    initialStream: joinStream,
    initialMicOn: joinMicOn,
    initialCameraOn: joinCameraOn,
  });

  const { recording, start: startRecording, stop: stopRecording } = useRecorder({ localStream, remoteStreams });

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
        startRecording();
      } catch {
        setRecordingError("Could not start recording.");
      }
    }
  }

  async function handleLeave() {
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

  // Pre-join lobby
  if (phase === "lobby") {
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
        showOriginalCaptions={showOriginalCaptions}
        captionsOn={captionsOn}
        recording={recording}
        participantCount={Object.keys(participants).length + 1}
        onToggleMic={toggleMic}
        onToggleCamera={toggleCamera}
        onToggleScreenShare={toggleScreenShare}
        onToggleChat={() => {
          setChatOpen((v) => {
            if (!v) { setParticipantsOpen(false); setTranscriptOpen(false); }
            return !v;
          });
        }}
        onToggleParticipants={() => {
          setParticipantsOpen((v) => {
            if (!v) { setChatOpen(false); setTranscriptOpen(false); }
            return !v;
          });
        }}
        onToggleTranscript={() => {
          setTranscriptOpen((v) => {
            if (!v) { setChatOpen(false); setParticipantsOpen(false); }
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
