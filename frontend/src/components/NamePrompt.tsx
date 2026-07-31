import { FormEvent, useState } from "react";
import { LinguaMeetLogo } from "@/components/Icons";

interface NamePromptProps {
  onSubmit: (name: string) => Promise<void> | void;
}

export function NamePrompt({ onSubmit }: NamePromptProps) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setError(null);
    setSubmitting(true);
    try {
      await onSubmit(trimmed);
    } catch {
      setError("Could not continue. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="page-gradient relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-4">
      <div className="bg-blob bg-blob-1" />
      <div className="bg-blob bg-blob-2" />

      <div className="relative z-10 w-full max-w-[440px] animate-meet-fade-in">
        <div className="glass-card rounded-3xl px-10 py-12 glow-blue">
          <div className="mb-8 flex flex-col items-center gap-4">
            <div className="animate-float">
              <LinguaMeetLogo size={52} />
            </div>
            <div className="text-center">
              <h1 className="text-3xl font-bold text-[#1a1a2e]">Welcome</h1>
              <p className="mt-1 text-sm text-[#64748b]">What should we call you?</p>
            </div>
          </div>

          {error && (
            <div className="mb-5 flex items-center gap-2 rounded-2xl bg-[#ea4335]/8 px-4 py-3 text-sm text-[#ea4335]">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="#ea4335">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
              </svg>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-[#64748b] uppercase tracking-wider">
                Your name
              </label>
              <input
                id="name-input"
                required
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Jane Doe"
                className="input-modern w-full"
              />
            </div>

            <button
              id="continue-button"
              type="submit"
              disabled={submitting || !name.trim()}
              className="btn-gradient w-full rounded-2xl py-4 text-base mt-2"
            >
              {submitting ? "Continuing..." : "Continue"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
