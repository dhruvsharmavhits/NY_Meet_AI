import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createThirdPartyApp,
  listThirdPartyApps,
  regenerateThirdPartyAppKey,
  ThirdPartyApp,
} from "@/services/api";
import { ContentCopyIcon, LinguaMeetLogo } from "@/components/Icons";

export default function ThirdPartyAppsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [ready, setReady] = useState(false);
  const [appName, setAppName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [revealedKey, setRevealedKey] = useState<{ forAppId: string; key: string } | null>(null);

  useEffect(() => {
    if (!localStorage.getItem("admin_token")) {
      router.replace("/admin/login");
      return;
    }
    setReady(true);
  }, [router]);

  const { data: apps } = useQuery({
    queryKey: ["third-party-apps"],
    queryFn: listThirdPartyApps,
    enabled: ready,
  });

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const created = await createThirdPartyApp(appName, companyName);
      setRevealedKey({ forAppId: created.id, key: created.api_key });
      setAppName("");
      setCompanyName("");
      queryClient.invalidateQueries({ queryKey: ["third-party-apps"] });
    } catch {
      setError("Could not create the app. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRegenerate(app: ThirdPartyApp) {
    setError(null);
    try {
      const regenerated = await regenerateThirdPartyAppKey(app.id);
      setRevealedKey({ forAppId: app.id, key: regenerated.api_key });
      queryClient.invalidateQueries({ queryKey: ["third-party-apps"] });
    } catch {
      setError("Could not regenerate the key. Please try again.");
    }
  }

  function copyKey(key: string) {
    navigator.clipboard?.writeText(key).catch(() => {});
  }

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center dark-gradient">
        <div className="meet-spinner-large" />
      </div>
    );
  }

  return (
    <div className="page-gradient relative overflow-hidden">
      <div className="bg-blob bg-blob-1" />
      <div className="bg-blob bg-blob-2" />

      <header className="glass-header sticky top-0 z-20 flex items-center justify-between px-5 py-3 sm:px-8">
        <div className="flex items-center gap-3">
          <LinguaMeetLogo size={36} />
          <span className="text-xl font-bold text-[#1a1a2e] tracking-tight">Third-party API keys</span>
        </div>
        <Link href="/admin" className="text-sm font-semibold text-[#4285f4]">
          Back to admin
        </Link>
      </header>

      <main className="relative z-10 mx-auto flex max-w-[900px] flex-col gap-8 px-6 py-10">
        {error && (
          <div className="glass-card flex items-center gap-2 rounded-2xl px-5 py-3 text-sm text-[#ea4335]">
            {error}
          </div>
        )}

        <section className="glass-card rounded-3xl p-6">
          <h2 className="mb-4 text-xs font-bold text-[#94a3b8] uppercase tracking-[0.15em]">
            Create a third-party app
          </h2>
          <form onSubmit={handleCreate} className="flex flex-wrap gap-3">
            <input
              value={appName}
              onChange={(e) => setAppName(e.target.value)}
              placeholder="App name"
              required
              className="input-modern flex-1"
            />
            <input
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="Company name"
              required
              className="input-modern flex-1"
            />
            <button
              type="submit"
              disabled={submitting || !appName || !companyName}
              className="btn-gradient rounded-2xl px-6 py-3 text-sm"
            >
              {submitting ? "Creating..." : "Create"}
            </button>
          </form>
        </section>

        <section className="glass-card rounded-3xl p-6">
          <h2 className="mb-4 text-xs font-bold text-[#94a3b8] uppercase tracking-[0.15em]">
            Existing apps
          </h2>
          <div className="divide-y divide-black/5">
            {apps?.map((app) => (
              <div key={app.id} className="py-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-[#1a1a2e]">{app.app_name}</p>
                    <p className="text-xs text-[#94a3b8] font-medium">
                      {app.company_name} · key {app.api_key_prefix}… · {app.status}
                    </p>
                  </div>
                  <button
                    onClick={() => handleRegenerate(app)}
                    className="rounded-xl px-4 py-2 text-xs font-semibold text-[#4285f4] hover:bg-black/5 transition-all duration-200"
                  >
                    Regenerate key
                  </button>
                </div>
                {revealedKey?.forAppId === app.id && (
                  <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl bg-[#0f9d58]/8 px-4 py-3">
                    <div>
                      <p className="text-xs font-semibold text-[#0f9d58]">
                        Copy this key now — it won't be shown again
                      </p>
                      <p className="mt-1 break-all font-mono text-xs text-[#1a1a2e]">{revealedKey.key}</p>
                    </div>
                    <button
                      onClick={() => copyKey(revealedKey.key)}
                      title="Copy API key"
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[#64748b] hover:bg-black/5 transition-all duration-200"
                    >
                      <ContentCopyIcon size={16} />
                    </button>
                  </div>
                )}
              </div>
            ))}
            {apps?.length === 0 && <p className="py-4 text-sm text-[#94a3b8]">No third-party apps yet</p>}
          </div>
        </section>
      </main>
    </div>
  );
}
