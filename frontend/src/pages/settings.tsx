import { useEffect, useState } from "react";
import Link from "next/link";
import { fetchMySettings, updateMySettings, UserSettings } from "@/services/api";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { NamePrompt } from "@/components/NamePrompt";
import { ArrowBackIcon, LinguaMeetLogo } from "@/components/Icons";

export default function SettingsPage() {
  const { user, loading, register } = useCurrentUser();
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (user) {
      fetchMySettings().then(setSettings);
    }
  }, [user]);

  async function handleSave() {
    if (!settings) return;
    setSaving(true);
    setSaved(false);
    try {
      const updated = await updateMySettings(settings);
      setSettings(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } finally {
      setSaving(false);
    }
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

  if (!settings) {
    return (
      <div className="page-gradient flex min-h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="meet-spinner-large" />
          <span className="text-sm font-medium text-[#64748b]">Loading...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="page-gradient relative min-h-screen overflow-hidden">
      {/* Background blobs */}
      <div className="bg-blob bg-blob-2" />

      {/* Header */}
      <header className="glass-header sticky top-0 z-20 flex items-center gap-4 px-5 py-3">
        <Link
          href="/dashboard"
          id="back-to-dashboard"
          className="flex h-10 w-10 items-center justify-center rounded-xl text-[#64748b] hover:bg-black/5 transition-all duration-200"
          aria-label="Back to dashboard"
        >
          <ArrowBackIcon size={20} />
        </Link>
        <div className="flex items-center gap-3">
          <LinguaMeetLogo size={30} />
          <h1 className="text-lg font-bold text-[#1a1a2e]">Settings</h1>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-[620px] px-4 py-8">
        <div className="animate-meet-fade-in space-y-6">
          {/* Caption settings card */}
          <div className="glass-card rounded-3xl overflow-hidden">
            <div className="px-7 py-5" style={{ background: "linear-gradient(135deg, rgba(66,133,244,0.06) 0%, rgba(124,58,237,0.04) 100%)" }}>
              <h2 className="text-base font-bold text-[#1a1a2e]">Caption preferences</h2>
              <p className="mt-0.5 text-sm text-[#64748b]">Customize how captions appear during meetings</p>
            </div>

            <div className="space-y-5 px-7 py-6">
              {/* Spoken language */}
              <div>
                <label htmlFor="spoken-language" className="mb-2 block text-xs font-semibold text-[#64748b] uppercase tracking-wider">
                  Language you speak
                </label>
                <select
                  id="spoken-language"
                  value={settings.spoken_language}
                  onChange={(e) => setSettings({ ...settings, spoken_language: e.target.value })}
                  className="input-modern w-full"
                >
                  <option value="en">English</option>
                  <option value="hi">Hindi</option>
                  <option value="gu">Gujarati</option>
                </select>
              </div>

              {/* Caption language */}
              <div>
                <label htmlFor="caption-language" className="mb-2 block text-xs font-semibold text-[#64748b] uppercase tracking-wider">
                  Caption language
                </label>
                <select
                  id="caption-language"
                  value={settings.caption_language}
                  onChange={(e) => setSettings({ ...settings, caption_language: e.target.value })}
                  className="input-modern w-full"
                >
                  <option value="en">English</option>
                  <option value="hi">Hindi</option>
                  <option value="gu">Gujarati</option>
                </select>
              </div>

              {/* Caption position */}
              <div>
                <label htmlFor="caption-position" className="mb-2 block text-xs font-semibold text-[#64748b] uppercase tracking-wider">
                  Caption position
                </label>
                <div className="flex gap-3">
                  {(["top", "bottom"] as const).map((pos) => (
                    <button
                      key={pos}
                      type="button"
                      onClick={() => setSettings({ ...settings, caption_position: pos })}
                      className={`flex-1 rounded-xl py-3 text-sm font-semibold capitalize transition-all duration-200 ${
                        settings.caption_position === pos
                          ? "bg-[#4285f4] text-white shadow-md shadow-blue-500/20"
                          : "bg-white/60 text-[#64748b] border-2 border-[#e2e8f0] hover:border-[#4285f4]/30"
                      }`}
                    >
                      {pos}
                    </button>
                  ))}
                </div>
              </div>

              {/* Caption font size */}
              <div>
                <label htmlFor="caption-font-size" className="mb-2 block text-xs font-semibold text-[#64748b] uppercase tracking-wider">
                  Caption font size
                </label>
                <div className="flex items-center gap-4">
                  <span className="text-xs text-[#94a3b8] font-medium">Aa</span>
                  <input
                    id="caption-font-size"
                    type="range"
                    min={10}
                    max={48}
                    value={settings.caption_font_size}
                    onChange={(e) => setSettings({ ...settings, caption_font_size: Number(e.target.value) })}
                    className="flex-1 accent-[#4285f4] h-2 rounded-full"
                  />
                  <span className="text-base text-[#94a3b8] font-bold">Aa</span>
                  <span className="w-12 text-center text-sm font-bold text-[#1a1a2e] bg-[#f1f5f9] rounded-lg py-1.5">{settings.caption_font_size}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Appearance card */}
          <div className="glass-card rounded-3xl overflow-hidden">
            <div className="px-7 py-5" style={{ background: "linear-gradient(135deg, rgba(124,58,237,0.06) 0%, rgba(236,72,153,0.04) 100%)" }}>
              <h2 className="text-base font-bold text-[#1a1a2e]">Appearance</h2>
              <p className="mt-0.5 text-sm text-[#64748b]">Choose how LinguaMeet looks to you</p>
            </div>

            <div className="px-7 py-6">
              <label className="flex cursor-pointer items-center justify-between rounded-2xl px-4 py-4 hover:bg-black/3 transition-all duration-200 -mx-1">
                <div>
                  <p className="text-sm font-semibold text-[#1a1a2e]">Dark mode</p>
                  <p className="text-xs text-[#94a3b8]">Reduce eye strain in low-light environments</p>
                </div>
                {/* Toggle switch */}
                <div className="relative inline-flex h-7 w-12 cursor-pointer items-center">
                  <input
                    type="checkbox"
                    checked={settings.dark_mode}
                    onChange={(e) => setSettings({ ...settings, dark_mode: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="h-7 w-12 rounded-full bg-[#e2e8f0] peer-checked:bg-[#4285f4] transition-colors duration-200" />
                  <div className="absolute left-0.5 top-0.5 h-6 w-6 rounded-full bg-white shadow-md transition-transform duration-200 peer-checked:translate-x-5" />
                </div>
              </label>
            </div>
          </div>

          {/* Save button area */}
          <div className="flex items-center justify-end gap-4 pt-2">
            {saved && (
              <span className="flex items-center gap-2 text-sm font-semibold text-[#0f9d58] animate-meet-fade-in">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="#0f9d58">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
                </svg>
                Settings saved
              </span>
            )}
            <button
              id="save-settings-button"
              onClick={handleSave}
              disabled={saving}
              className="btn-gradient rounded-2xl px-8 py-3.5 text-sm"
            >
              {saving ? (
                <span className="flex items-center gap-2">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  Saving...
                </span>
              ) : (
                "Save settings"
              )}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
