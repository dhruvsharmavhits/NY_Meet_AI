import { FormEvent, useState } from "react";
import { useRouter } from "next/router";
import { adminLogin } from "@/services/api";
import { LinguaMeetLogo } from "@/components/Icons";

export default function AdminLoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const token = await adminLogin(password);
      localStorage.setItem("admin_token", token);
      router.push("/admin");
    } catch {
      setError("Invalid password");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="page-gradient relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-4">
      <div className="bg-blob bg-blob-1" />
      <div className="bg-blob bg-blob-2" />

      <div className="relative z-10 w-full max-w-[420px] animate-meet-fade-in">
        <div className="glass-card rounded-3xl px-10 py-12 glow-blue">
          <div className="mb-8 flex flex-col items-center gap-4">
            <LinguaMeetLogo size={48} />
            <div className="text-center">
              <h1 className="text-2xl font-bold text-[#1a1a2e]">Admin login</h1>
              <p className="mt-1 text-sm text-[#64748b]">Doctor/provider access only</p>
            </div>
          </div>

          {error && (
            <div className="mb-5 flex items-center gap-2 rounded-2xl bg-[#ea4335]/8 px-4 py-3 text-sm text-[#ea4335]">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <input
              id="admin-password-input"
              type="password"
              required
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Admin password"
              className="input-modern w-full"
            />
            <button
              id="admin-login-button"
              type="submit"
              disabled={submitting || !password}
              className="btn-gradient w-full rounded-2xl py-4 text-base"
            >
              {submitting ? "Signing in..." : "Sign in"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
