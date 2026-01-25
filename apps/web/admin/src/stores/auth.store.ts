import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { STORAGE_KEYS } from "@/core/constants/storage";

export interface AuthState {
  accessToken: string | null;
  setAccessToken: (token: string | null) => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      setAccessToken: (accessToken) => set({ accessToken }),
      clear: () => set({ accessToken: null }),
    }),
    {
      name: STORAGE_KEYS.auth,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ accessToken: s.accessToken }),
      version: 1,
    },
  ),
);
