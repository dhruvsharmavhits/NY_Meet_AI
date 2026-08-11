import { FormEvent, useEffect, useRef, useState } from "react";
import { useDevicePreview } from "@/meeting/useDevicePreview";
import { LinguaMeetLogo, MicIcon, MicOffIcon, VideocamIcon, VideocamOffIcon } from "@/components/Icons";

interface PreJoinLobbyProps {
  meetingTitle: string;
  roomCode: string;
  defaultName: string;
  defaultCaptionLanguage: string;
  onJoin: (name: string, stream: MediaStream | null, micOn: boolean, cameraOn: boolean, captionLanguage: string) => void;
}

function initialsFor(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "?";
  const parts = trimmed.split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || trimmed[0].toUpperCase();
}

export function PreJoinLobby({ meetingTitle, roomCode, defaultName, defaultCaptionLanguage, onJoin }: PreJoinLobbyProps) {
  const { stream, micOn, cameraOn, loading, error, toggleMic, toggleCamera, release } = useDevicePreview(true);
  const [name, setName] = useState(defaultName);
  const [captionLanguage, setCaptionLanguage] = useState(defaultCaptionLanguage);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    setName(defaultName);
  }, [defaultName]);

  useEffect(() => {
    setCaptionLanguage(defaultCaptionLanguage);
  }, [defaultCaptionLanguage]);

  useEffect(() => {
    if (!videoRef.current) return;

    videoRef.current.srcObject = stream ? new MediaStream(stream.getVideoTracks()) : stream;

    if (stream) {
      videoRef.current.play().catch(() => {});
    }
  }, [stream]);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const finalName = name.trim() || "Guest";
    onJoin(finalName, release(), micOn, cameraOn, captionLanguage);
  }

  return (
    <div className="page-gradient min-h-screen flex flex-col relative overflow-hidden">
      {/* Background blobs */}
      <div className="bg-blob bg-blob-1" />
      <div className="bg-blob bg-blob-2" />

      {/* Header */}
      <header className="relative z-10 flex items-center px-6 py-4">
        <div className="flex items-center gap-3">
          <LinguaMeetLogo size={36} />
          <span className="text-xl font-semibold text-[#1a1a2e] tracking-tight">
            LinguaMeet
          </span>
        </div>
      </header>

      {/* Main content */}
      <main className="relative z-10 flex flex-1 flex-col items-center justify-center gap-10 px-4 py-6 sm:flex-row sm:gap-16 lg:gap-20">
        {/* Left: Video preview — fixed minimum height so it doesn't collapse */}
        <div className="flex flex-col items-center gap-4 animate-meet-fade-in w-full max-w-[520px]">
          <div
            className="relative w-full overflow-hidden rounded-3xl bg-[#1a1a2e] shadow-2xl ring-1 ring-black/5"
            style={{ minHeight: "320px", aspectRatio: "16/10" }}
          >
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={`absolute inset-0 h-full w-full -scale-x-100 object-contain ${cameraOn && stream ? "" : "hidden"}`}
            />
            {(!cameraOn || !stream) && (
              <div
                className="absolute inset-0 flex flex-col items-center justify-center"
                style={{ background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)" }}
              >
                {loading ? (
                  <div className="flex flex-col items-center gap-4">
                    <p className="text-base font-medium text-white/70">
                      Setting up your camera...
                    </p>
                    <div className="meet-spinner-large" />
                  </div>
                ) : (
                  <div
                    className="flex h-24 w-24 items-center justify-center rounded-full text-4xl font-semibold text-white sm:h-28 sm:w-28"
                    style={{
                      background: "linear-gradient(135deg, #7c3aed 0%, #4285f4 100%)",
                      boxShadow: "0 12px 40px rgba(124, 58, 237, 0.3)",
                    }}
                  >
                    {initialsFor(name)}
                  </div>
                )}
              </div>
            )}

            {/* Bottom controls - mic and camera toggle */}
            <div className="absolute bottom-5 left-1/2 z-10 flex -translate-x-1/2 gap-3">
              <button
                type="button"
                onClick={toggleMic}
                id="lobby-mic-toggle"
                aria-label={micOn ? "Turn off microphone" : "Turn on microphone"}
                className={`flex h-14 w-14 items-center justify-center rounded-full transition-all duration-200 hover:scale-110 ${
                  micOn
                    ? "bg-white/15 text-white backdrop-blur-sm hover:bg-white/25"
                    : "bg-gradient-to-br from-[#ea4335] to-[#ff6b6b] text-white shadow-lg shadow-red-500/30"
                }`}
              >
                {micOn ? <MicIcon size={22} /> : <MicOffIcon size={22} />}
              </button>
              <button
                type="button"
                onClick={toggleCamera}
                id="lobby-camera-toggle"
                aria-label={cameraOn ? "Turn off camera" : "Turn on camera"}
                className={`flex h-14 w-14 items-center justify-center rounded-full transition-all duration-200 hover:scale-110 ${
                  cameraOn
                    ? "bg-white/15 text-white backdrop-blur-sm hover:bg-white/25"
                    : "bg-gradient-to-br from-[#ea4335] to-[#ff6b6b] text-white shadow-lg shadow-red-500/30"
                }`}
              >
                {cameraOn ? <VideocamIcon size={22} /> : <VideocamOffIcon size={22} />}
              </button>
            </div>
          </div>

          {error && (
            <div className="glass-card flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs text-[#ea4335]">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="#ea4335">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
              </svg>
              {error}
            </div>
          )}
        </div>

        {/* Right: Join form */}
        <form
          onSubmit={handleSubmit}
          className="flex w-full max-w-[340px] flex-col items-center gap-6 sm:items-start animate-meet-fade-in"
          style={{ animationDelay: "0.15s" }}
        >
          <div className="glass-card rounded-3xl p-8 w-full">
            <h1 className="text-2xl font-bold text-[#1a1a2e] mb-1">Ready to join?</h1>
            <p className="text-sm text-[#64748b] mb-6">Enter your name to continue</p>

            <div className="mb-6">
              <input
                id="lobby-name-input"
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                maxLength={60}
                className="input-modern w-full"
              />
              <span className="mt-1.5 block text-right text-xs text-[#94a3b8]">{name.length}/60</span>
            </div>
            <div className="mb-6">
              <label htmlFor="lobby-caption-language" className="mb-2 block text-xs font-semibold text-[#64748b] uppercase tracking-wider">
                Caption language
              </label>
              <select
                id="lobby-caption-language"
                value={captionLanguage}
                onChange={(e) => setCaptionLanguage(e.target.value)}
                className="input-modern w-full"
              >
                <option value="en">English</option>
                <option value="hi">Hindi</option>
                <option value="gu">Gujarati</option>
              </select>
            </div>

            <button
              id="lobby-join-button"
              type="submit"
              className="btn-gradient w-full rounded-2xl px-8 py-4 text-base"
            >
              Join now
            </button>
          </div>
        </form>
      </main>

      {/* Footer */}
      <footer className="relative z-10 py-4 text-center text-xs text-[#94a3b8]">
        By joining, you agree to our{" "}
        <a href="#" className="text-[#4285f4] hover:underline">Terms</a>{" "}
        and{" "}
        <a href="#" className="text-[#4285f4] hover:underline">Privacy Policy</a>.
      </footer>
    </div>
  );
}
