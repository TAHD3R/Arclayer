import type { TokenPair } from "@arclayer/openapi";

export interface AuthState {
  keepSession: boolean;
  /**
   * Bumps when the auth session meaningfully changes (login/logout).
   * Used to scope React Query keys so stale error/data from a previous session won't persist.
   */
  sessionVersion: number;
  accessToken: string | null;
  refreshToken: string | null;
  tokenType: string | null;
  expiresIn: number | null;
  refreshExpiresIn: number | null;
  setAccessToken: (token: string | null) => void;
  setTokens: (tokens: unknown | null) => void;
  setKeepSession: (keepSession: boolean) => void;
  applyLogin: (tokens: TokenPair, options: { keepSession: boolean }) => void;
  clear: () => void;
}
