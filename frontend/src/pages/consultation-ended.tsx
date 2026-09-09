import { LinguaMeetLogo } from "@/components/Icons";

export default function ConsultationEndedPage() {
  return (
    <div className="page-gradient relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-4">
      <div className="bg-blob bg-blob-1" />
      <div className="bg-blob bg-blob-2" />

      <div className="relative z-10 w-full max-w-[440px] animate-meet-fade-in">
        <div className="glass-card rounded-3xl px-10 py-12 text-center glow-blue">
          <div className="mb-6 flex justify-center">
            <div
              className="flex h-16 w-16 items-center justify-center rounded-full"
              style={{ background: "linear-gradient(135deg, #0f9d58, #34d399)" }}
            >
              <svg width="32" height="32" viewBox="0 0 24 24" fill="white">
                <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
              </svg>
            </div>
          </div>
          <h1 className="text-2xl font-bold text-[#1a1a2e]">Thank you</h1>
          <p className="mt-3 text-sm text-[#64748b] leading-relaxed">
            Your consultation has ended. Thank you for your time — you may now close this window.
          </p>
          <div className="mt-6 flex justify-center">
            <LinguaMeetLogo size={32} />
          </div>
        </div>
      </div>
    </div>
  );
}
