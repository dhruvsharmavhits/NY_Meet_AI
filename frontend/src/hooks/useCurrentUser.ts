import { useEffect, useState } from "react";
import { createUser, fetchMe } from "@/services/api";
import { useAuthStore } from "@/store/authStore";

/**
 * No login/register — a visitor just types a display name once (see
 * NamePrompt), which creates a lightweight temp user server-side. The id is
 * persisted in localStorage and reused on later visits from the same browser.
 */
export function useCurrentUser() {
  const { user, setUser } = useAuthStore();
  const [loading, setLoading] = useState(!user);

  useEffect(() => {
    if (user) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function bootstrap() {
      const existingId = localStorage.getItem("user_id");
      if (!existingId) return;
      try {
        const me = await fetchMe();
        if (!cancelled) setUser(me);
      } catch {
        localStorage.removeItem("user_id");
      }
    }

    bootstrap().finally(() => {
      if (!cancelled) setLoading(false);
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function register(fullName: string) {
    const created = await createUser(fullName);
    setUser(created);
  }

  return { user, loading, register };
}
