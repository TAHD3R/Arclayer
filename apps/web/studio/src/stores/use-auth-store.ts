import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { STORAGE_KEYS } from "@/constants/storage";

type TokenPairNormalized = {
  accessToken: string | null;
  refreshToken: string | null;
  tokenType: string | null;
  expiresIn: number | null;
  refreshExpiresIn: number | null;
};

function normalizeTokenPair(tokens: unknown): TokenPairNormalized {
  if (!tokens || typeof tokens !== "object") {
    return {
      accessToken: null,
      refreshToken: null,
      tokenType: null,
      expiresIn: null,
      refreshExpiresIn: null,
    };
  }
  const t = tokens as Record<string, unknown>;
  const accessToken =
    typeof t.access_token === "string"
      ? t.access_token
      : typeof t.accessToken === "string"
        ? t.accessToken
        : null;
  const refreshToken =
    typeof t.refresh_token === "string"
      ? t.refresh_token
      : typeof t.refreshToken === "string"
        ? t.refreshToken
        : null;
  const tokenType =
    typeof t.token_type === "string"
      ? t.token_type
      : typeof t.tokenType === "string"
        ? t.tokenType
        : null;
  const expiresIn =
    typeof t.expires_in === "number"
      ? t.expires_in
      : typeof t.expiresIn === "number"
        ? t.expiresIn
        : null;
  const refreshExpiresIn =
    typeof t.refresh_expires_in === "number"
      ? t.refresh_expires_in
      : typeof t.refreshExpiresIn === "number"
        ? t.refreshExpiresIn
        : null;
  return { accessToken, refreshToken, tokenType, expiresIn, refreshExpiresIn };
}

export type AuthState = {
  keepSession: boolean;
  accessToken: string | null;
  refreshToken: string | null;
  tokenType: string | null;
  expiresIn: number | null;
  refreshExpiresIn: number | null;
  setAccessToken: (token: string | null) => void;
  setTokens: (tokens: unknown) => void;
  setKeepSession: (keep: boolean) => void;
  applyLogin: (tokens: unknown, options: { keepSession: boolean }) => void;
  clear: () => void;
};

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
