import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { useQuery } from "@tanstack/react-query";
import {
  createUser,
  fetchMe,
  getPatientLinkInfo,
  getPatientSession,
  joinPatientLink,
  JoinPatientLinkResult,
  updateMySettings,
} from "@/services/api";
import { useAuthStore } from "@/store/authStore";
import { LinguaMeetLogo } from "@/components/Icons";

export default function PatientLinkPage() {
  const router = useRouter();
  const code = typeof router.query.code === "string" ? router.query.code : undefined;
  const { user, setUser } = useAuthStore();

  const [identityReady, setIdentityReady] = useState(false);
  const [captionLanguage, setCaptionLanguage] = useState("en");
  const [joined, setJoined] = useState<JoinPatientLinkResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [deviceNotice, setDeviceNotice] = useState<string | null>(null);

  const { data: linkInfo } = useQuery({
    queryKey: ["patient-link-info", code],
    queryFn: () => getPatientLinkInfo(code as string),
    enabled: !!code,
    retry: false,
  });

  // Patients never type a name — a lightweight identity is created silently
  // so the account exists, then the join call overwrites it with the
  // doctor-given name from the link.
  useEffect(() => {
    if (!code || identityReady) return;
    const existingId = localStorage.getItem("user_id");
    (existingId ? fetchMe() : createUser("Patient"))
      .then(setUser)
      .catch(() => createUser("Patient").then(setUser))
      .finally(() => setIdentityReady(true));
  }, [code, identityReady, setUser]);

  // Ask for mic/camera permission as soon as the page is up, before the
  // patient presses Join, so the later auto-join into the room already has
  // access and never blocks on a browser prompt. Neither device is required.
  useEffect(() => {
    if (!identityReady) return;
    let cancelled = false;
    (async () => {
      const attempts: MediaStreamConstraints[] = [
        { audio: true, video: true },
        { audio: true, video: false },
        { audio: false, video: true },
      ];
      let granted: MediaStream | null = null;
      let lastErr: unknown = null;
      for (const constraints of attempts) {
        try {
          granted = await navigator.mediaDevices.getUserMedia(constraints);
          break;
        } catch (err) {
          lastErr = err;
        }
      }
      granted?.getTracks().forEach((t) => t.stop());
      if (cancelled || granted) return;
      const reason = lastErr instanceof DOMException ? lastErr.name : "";
      setDeviceNotice(
        reason === "NotAllowedError"
          ? "Camera and microphone access was blocked. You can still join, but others won't see or hear you."
          : "No camera or microphone was found. You can still join, but others won't see or hear you."
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [identityReady]);

  useEffect(() => {
    if (!joined || joined.session.status === "active") return;
    const interval = setInterval(async () => {
      try {
        const updated = await getPatientSession(joined.session.id);
        setJoined(updated);
      } catch {
        // best-effort
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [joined]);

  useEffect(() => {
    if (joined?.session.status !== "active") return;
    if (joined.room_code && joined.access_token) {
      router.push(`/meeting/${joined.room_code}?patient=1&token=${encodeURIComponent(joined.access_token)}`);
      return;
    }
    // Admitted but this response didn't carry a usable token yet (e.g. it
    // arrived from a stale/cached poll) — re-fetch once instead of hanging.
    const retry = setTimeout(async () => {
      try {
        const updated = await getPatientSession(joined.session.id);
        setJoined(updated);
      } catch {
        setError("Could not connect you to the consultation. Please refresh this page.");
      }
    }, 1500);
    return () => clearTimeout(retry);
  }, [joined, router]);

  async function handleJoinQueue() {
    if (!code || !user) return;
    setError(null);
    setJoining(true);
    try {
      await updateMySettings({ caption_language: captionLanguage });
      const result = await joinPatientLink(code);
      setJoined(result);
    } catch {
      setError("This link is invalid or no longer active.");
    } finally {
      setJoining(false);
    }
  }

  if (!identityReady || !user) {
    return (
      <div className="page-gradient flex min-h-screen items-center justify-center">
        <div className="meet-spinner-large" />
      </div>
    );
  }

  return (
    <div className="page-gradient relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-4">
      <div className="bg-blob bg-blob-1" />
      <div className="bg-blob bg-blob-2" />

      <div className="relative z-10 w-full max-w-[440px] animate-meet-fade-in">
        <div className="glass-card rounded-3xl px-10 py-12 text-center glow-blue">
          <div className="mb-6 flex justify-center">
            <LinguaMeetLogo size={48} />
          </div>

          {error && <p className="text-sm text-[#ea4335]">{error}</p>}

          {!error && !joined && (
            <>
              <h1 className="text-2xl font-bold text-[#1a1a2e]">
                {linkInfo ? `Hi, ${linkInfo.patient_name}` : "Loading..."}
              </h1>
              <p className="mt-2 text-sm text-[#64748b]">
                {linkInfo ? `You're joining with ${linkInfo.title}` : ""}
              </p>

              {linkInfo && (
                <div className="mt-6 text-left">
                  <label htmlFor="patient-caption-language" className="mb-2 block text-xs font-semibold text-[#64748b] uppercase tracking-wider">
                    Caption language
                  </label>
                  <select
                    id="patient-caption-language"
                    value={captionLanguage}
                    onChange={(e) => setCaptionLanguage(e.target.value)}
                    className="input-modern w-full"
                  >
                    <option value="en">English</option>
                    <option value="hi">Hindi</option>
                    <option value="gu">Gujarati</option>
                  </select>

                  {deviceNotice && (
                    <p className="mt-4 rounded-2xl bg-[#f4b400]/10 px-4 py-3 text-xs text-[#92400e]">{deviceNotice}</p>
                  )}

                  <button
                    id="patient-join-button"
                    onClick={handleJoinQueue}
                    disabled={joining}
                    className="btn-gradient mt-6 w-full rounded-2xl px-8 py-4 text-base"
                  >
                    {joining ? "Joining..." : "Join"}
                  </button>
                </div>
              )}
            </>
          )}

          {!error && joined && joined.session.status === "waiting" && (
            <>
              <h1 className="text-2xl font-bold text-[#1a1a2e]">Please wait</h1>
              <p className="mt-3 text-lg text-[#4285f4] font-semibold">
                Your waiting number is {joined.session.queue_position}
              </p>
              <p className="mt-2 text-sm text-[#64748b]">
                Please wait until the doctor/provider admits you. This page will update automatically.
              </p>
              <div className="mt-6 flex justify-center">
                <div className="meet-spinner" />
              </div>
            </>
          )}

          {!error && joined && joined.session.status === "active" && (
            <>
              <h1 className="text-2xl font-bold text-[#1a1a2e]">You're being admitted</h1>
              <p className="mt-2 text-sm text-[#64748b]">Connecting you to your doctor now...</p>
              <div className="mt-6 flex justify-center">
                <div className="meet-spinner" />
              </div>
            </>
          )}

          {!error && joined && joined.session.status === "completed" && (
            <>
              <h1 className="text-2xl font-bold text-[#1a1a2e]">Consultation completed</h1>
              <p className="mt-2 text-sm text-[#64748b]">This link has already been used.</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
