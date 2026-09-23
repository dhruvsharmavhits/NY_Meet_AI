import { FormEvent, useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import { createAdminAccount } from "@/services/api";
import { LinguaMeetLogo } from "@/components/Icons";

export default function AdminRegisterPage() {
  const router = useRouter();
  const [masterPassword, setMasterPassword] = useState("");
  const [userId, setUserId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await createAdminAccount(masterPassword, userId, password);
      router.push("/admin/login");
    } catch (err: any) {
      setError(err?.response?.data?.detail || "Could not create admin account");
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
              <h1 className="text-2xl font-bold text-[#1a1a2e]">Create admin account</h1>
              <p className="mt-1 text-sm text-[#64748b]">Requires the master password</p>
            </div>
          </div>

          {error && (
            <div className="mb-5 flex items-center gap-2 rounded-2xl bg-[#ea4335]/8 px-4 py-3 text-sm text-[#ea4335]">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <input
              id="admin-master-password-input"
              type="password"
              required
              autoFocus
              value={masterPassword}
              onChange={(e) => setMasterPassword(e.target.value)}
              placeholder="Master password"
              className="input-modern w-full"
            />
            <input
              id="admin-register-userid-input"
              type="text"
              required
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              placeholder="User ID"
              className="input-modern w-full"
            />
            <input
              id="admin-register-password-input"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              className="input-modern w-full"
            />
            <button
              id="admin-register-button"
              type="submit"
              disabled={submitting || !masterPassword || !userId || !password}
              className="btn-gradient w-full rounded-2xl py-4 text-base"
            >
              {submitting ? "Creating..." : "Create account"}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-[#64748b]">
            Already have an account?{" "}
            <Link href="/admin/login" className="font-semibold text-[#4285f4]">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
