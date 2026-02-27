import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { STORAGE_KEYS } from "@/constants/storage";
import { normalizeTokenPair } from "@/lib/auth/token-normalizer";
import type { AuthState } from "@/types/stores";

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      keepSession: true,
      accessToken: null,
      refreshToken: null,
      tokenType: null,
      expiresIn: null,
      refreshExpiresIn: null,

      setAccessToken: (accessToken) => set({ accessToken }),

      setTokens: (tokens) => {
        if (!tokens) {
          set({
            accessToken: null,
            refreshToken: null,
            tokenType: null,
            expiresIn: null,
            refreshExpiresIn: null,
          });
          return;
        }
        set(normalizeTokenPair(tokens));
      },

      setKeepSession: (keepSession) => set({ keepSession }),

      applyLogin: (tokens, options) => {
        const normalized = normalizeTokenPair(tokens);
        set({
          keepSession: options.keepSession,
          ...normalized,
          // Drop refresh token when user does not opt in to persistent sessions.
          ...(options.keepSession ? {} : { refreshToken: null, refreshExpiresIn: null }),
        });
      },

      clear: () =>
        set((prev) => ({
          keepSession: prev.keepSession,
          accessToken: null,
          refreshToken: null,
          tokenType: null,
          expiresIn: null,
          refreshExpiresIn: null,
        })),
    }),
    {
      name: STORAGE_KEYS.auth,
      storage: createJSONStorage(() => localStorage),
      version: 1,
      partialize: (s) => ({
        keepSession: s.keepSession,
        accessToken: s.accessToken,
        tokenType: s.tokenType,
        expiresIn: s.expiresIn,
        refreshToken: s.keepSession ? s.refreshToken : null,
        refreshExpiresIn: s.keepSession ? s.refreshExpiresIn : null,
      }),
    },
  ),
);
