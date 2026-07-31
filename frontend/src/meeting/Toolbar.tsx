import { useEffect, useRef, useState } from "react";
import {
  MicIcon,
  MicOffIcon,
  VideocamIcon,
  VideocamOffIcon,
  ScreenShareIcon,
  StopScreenShareIcon,
  CaptionsIcon,
  MoreVertIcon,
  CallEndIcon,
  ChatIcon,
  PeopleIcon,
  RecordIcon,
  StopIcon,
  TranscriptIcon,
  SummaryIcon,
} from "@/components/Icons";

interface ToolbarProps {
  micOn: boolean;
  cameraOn: boolean;
  screenSharing: boolean;
  chatOpen: boolean;
  participantsOpen: boolean;
  transcriptOpen: boolean;
  showOriginalCaptions: boolean;
  captionsOn: boolean;
  recording: boolean;
  participantCount: number;
  onToggleMic: () => void;
  onToggleCamera: () => void;
  onToggleScreenShare: () => void;
  onToggleChat: () => void;
  onToggleParticipants: () => void;
  onToggleTranscript: () => void;
  onToggleCaptions: () => void;
  onToggleCaptionMode: () => void;
  onToggleRecording: () => void;
  onShowSummary: () => void;
  onLeave: () => void;
}

function ToolbarButton({
  id,
  active,
  off,
  onClick,
  label,
  children,
  badge,
}: {
  id?: string;
  active?: boolean;
  off?: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
  badge?: string | number;
}) {
  return (
    <button
      id={id}
      onClick={onClick}
      aria-label={label}
      data-tooltip={label}
      className={`relative flex h-12 w-12 items-center justify-center rounded-full text-white transition-all duration-200 ${
        off
          ? "bg-gradient-to-br from-[#ea4335] to-[#ff6b6b] shadow-lg shadow-red-500/20 hover:shadow-red-500/40 hover:scale-105"
          : active
            ? "bg-[#4285f4]/25 text-[#8ab4f8] ring-1 ring-[#4285f4]/30 hover:bg-[#4285f4]/35"
            : "bg-white/10 hover:bg-white/20 hover:scale-105"
      }`}
    >
      {children}
      {badge !== undefined && (
        <span className="absolute -right-1 -top-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[#4285f4] px-1 text-[10px] font-bold text-white shadow-md">
          {badge}
        </span>
      )}
    </button>
  );
}

export function Toolbar({
  micOn,
  cameraOn,
  screenSharing,
  chatOpen,
  participantsOpen,
  transcriptOpen,
  showOriginalCaptions,
  captionsOn,
  recording,
  participantCount,
  onToggleMic,
  onToggleCamera,
  onToggleScreenShare,
  onToggleChat,
  onToggleParticipants,
  onToggleTranscript,
  onToggleCaptions,
  onToggleCaptionMode,
  onToggleRecording,
  onShowSummary,
  onLeave,
}: ToolbarProps) {
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!moreOpen) return;
    function onDocClick(e: MouseEvent) {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setMoreOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [moreOpen]);

  return (
    <div className="relative z-10 flex items-center justify-between px-4 py-3 glass-card-dark" style={{ background: "rgba(15, 12, 41, 0.7)", backdropFilter: "blur(20px)" }}>
      {/* Left spacer */}
      <div className="hidden w-[100px] sm:block" />

      {/* Center: main controls */}
      <div className="flex flex-1 flex-wrap items-center justify-center gap-3">
        {/* Microphone */}
        <ToolbarButton
          id="toolbar-mic"
          off={!micOn}
          onClick={onToggleMic}
          label={micOn ? "Turn off microphone" : "Turn on microphone"}
        >
          {micOn ? <MicIcon size={20} /> : <MicOffIcon size={20} />}
        </ToolbarButton>

        {/* Camera */}
        <ToolbarButton
          id="toolbar-camera"
          off={!cameraOn}
          onClick={onToggleCamera}
          label={cameraOn ? "Turn off camera" : "Turn on camera"}
        >
          {cameraOn ? <VideocamIcon size={20} /> : <VideocamOffIcon size={20} />}
        </ToolbarButton>

        {/* Captions */}
        <ToolbarButton
          id="toolbar-captions"
          active={captionsOn}
          onClick={onToggleCaptions}
          label={captionsOn ? "Turn off captions" : "Turn on captions"}
        >
          <CaptionsIcon size={20} />
        </ToolbarButton>

        {/* Screen share */}
        <ToolbarButton
          id="toolbar-screenshare"
          active={screenSharing}
          onClick={onToggleScreenShare}
          label={screenSharing ? "Stop sharing" : "Share screen"}
        >
          {screenSharing ? <StopScreenShareIcon size={20} /> : <ScreenShareIcon size={20} />}
        </ToolbarButton>

        {/* More options */}
        <div ref={moreRef} className="relative">
          <ToolbarButton
            id="toolbar-more"
            active={moreOpen}
            onClick={() => setMoreOpen((v) => !v)}
            label="More options"
          >
            <MoreVertIcon size={20} />
          </ToolbarButton>

          {/* Dropdown menu */}
          {moreOpen && (
            <div className="absolute bottom-16 left-1/2 -translate-x-1/2 w-[260px] overflow-hidden rounded-2xl py-2 text-sm text-white shadow-2xl animate-meet-scale-in" style={{ background: "rgba(30, 30, 46, 0.95)", backdropFilter: "blur(20px)" }}>
              <button
                onClick={() => {
                  onToggleCaptionMode();
                  setMoreOpen(false);
                }}
                className="flex w-full items-center gap-3 px-5 py-3 hover:bg-white/8 transition-colors"
              >
                <CaptionsIcon size={20} className="text-[#8ab4f8]" />
                <div className="text-left">
                  <p className="font-medium">Caption mode</p>
                  <p className="text-xs text-white/40">{showOriginalCaptions ? "Showing original" : "Showing translated"}</p>
                </div>
              </button>
              <button
                onClick={() => {
                  onToggleTranscript();
                  setMoreOpen(false);
                }}
                className={`flex w-full items-center gap-3 px-5 py-3 hover:bg-white/8 transition-colors ${
                  transcriptOpen ? "bg-white/5" : ""
                }`}
              >
                <TranscriptIcon size={20} className="text-[#8ab4f8]" />
                <span className="font-medium">Transcript</span>
              </button>
              <button
                onClick={() => {
                  onShowSummary();
                  setMoreOpen(false);
                }}
                className="flex w-full items-center gap-3 px-5 py-3 hover:bg-white/8 transition-colors"
              >
                <SummaryIcon size={20} className="text-[#8ab4f8]" />
                <span className="font-medium">Meeting summary</span>
              </button>
              <div className="my-1 mx-4 border-t border-white/8" />
              <button
                onClick={() => {
                  onToggleRecording();
                  setMoreOpen(false);
                }}
                className="flex w-full items-center gap-3 px-5 py-3 hover:bg-white/8 transition-colors"
              >
                {recording ? (
                  <StopIcon size={20} className="text-[#ea4335]" />
                ) : (
                  <RecordIcon size={20} className="text-[#ea4335]" />
                )}
                <span className="font-medium">{recording ? "Stop recording" : "Record meeting"}</span>
                {recording && (
                  <span className="ml-auto flex h-2.5 w-2.5 rounded-full bg-[#ea4335] animate-pulse" />
                )}
              </button>
            </div>
          )}
        </div>

        {/* Leave call — wider, gradient */}
        <button
          id="toolbar-leave"
          onClick={onLeave}
          aria-label="Leave call"
          data-tooltip="Leave call"
          className="btn-gradient-red flex h-12 items-center justify-center gap-2 rounded-full px-8 text-white font-medium"
        >
          <CallEndIcon size={20} />
          <span className="hidden sm:inline text-sm">Leave</span>
        </button>
      </div>

      {/* Right: side panel toggles */}
      <div className="hidden items-center gap-2 sm:flex">
        <ToolbarButton
          id="toolbar-participants"
          active={participantsOpen}
          onClick={onToggleParticipants}
          label="People"
          badge={participantCount}
        >
          <PeopleIcon size={20} />
        </ToolbarButton>
        <ToolbarButton
          id="toolbar-chat"
          active={chatOpen}
          onClick={onToggleChat}
          label="Chat"
        >
          <ChatIcon size={20} />
        </ToolbarButton>
      </div>
    </div>
  );
}
