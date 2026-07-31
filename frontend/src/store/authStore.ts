import { create } from "zustand";
import type { User } from "@/services/api";

interface AuthState {
  user: User | null;
  setUser: (user: User) => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  setUser: (user) => {
    if (typeof window !== "undefined") {
      localStorage.setItem("user_id", user.id);
    }
    set({ user });
  },
  clear: () => {
    if (typeof window !== "undefined") {
      localStorage.removeItem("user_id");
    }
    set({ user: null });
  },
}));
