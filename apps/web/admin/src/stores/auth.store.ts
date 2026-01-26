import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { STORAGE_KEYS } from "@/core/constants/storage";
import type { TokenPair } from "@/api/auth";

export interface AuthState {
  /**
   * Whether to persist tokens and enable silent refresh across page reloads.
   * If false, the admin session is in-memory only and expires when the access token expires.
   */
  keepSession: boolean;
  accessToken: string | null;
  refreshToken: string | null;
  tokenType: string | null;
  expiresIn: number | null;
  refreshExpiresIn: number | null;
  setAccessToken: (token: string | null) => void;
  setTokens: (tokens: TokenPair | null) => void;
  setKeepSession: (keepSession: boolean) => void;
  applyLogin: (tokens: TokenPair, options: { keepSession: boolean }) => void;
  clear: () => void;
}

function normalizeTokenPair(tokens: TokenPair): {
  accessToken: string | null;
  refreshToken: string | null;
  tokenType: string | null;
  expiresIn: number | null;
  refreshExpiresIn: number | null;
} {
  // Backend may serialize in either snake_case or camelCase depending on Pydantic config.
  // Be permissive here so auth doesn't break when the API switches serialization style.
  const raw = tokens as any;
  const accessToken = (raw.access_token ?? raw.accessToken ?? null) as string | null;
  const refreshToken = (raw.refresh_token ?? raw.refreshToken ?? null) as string | null;
  const tokenType = (raw.token_type ?? raw.tokenType ?? null) as string | null;
  const expiresIn = (raw.expires_in ?? raw.expiresIn ?? null) as number | null;
  const refreshExpiresIn = (raw.refresh_expires_in ?? raw.refreshExpiresIn ?? null) as
    | number
    | null;

  return { accessToken, refreshToken, tokenType, expiresIn, refreshExpiresIn };
}

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
        const normalized = normalizeTokenPair(tokens);
        set(normalized);
      },

      setKeepSession: (keepSession) => set({ keepSession }),

      applyLogin: (tokens, options) => {
        const normalized = normalizeTokenPair(tokens);
        set({
          keepSession: options.keepSession,
          ...normalized,
          // When user does NOT opt in, we explicitly drop refresh token so silent refresh won't happen.
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
      partialize: (s) => ({
        keepSession: s.keepSession,
        accessToken: s.accessToken,
        tokenType: s.tokenType,
        expiresIn: s.expiresIn,
        // Only persist refresh token when user opts in to keep the session alive.
        refreshToken: s.keepSession ? s.refreshToken : null,
        refreshExpiresIn: s.keepSession ? s.refreshExpiresIn : null,
      }),
      version: 1,
    },
  ),
);
