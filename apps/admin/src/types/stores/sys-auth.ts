export type SysAuthState = {
  /**
   * Bumps when sys step-up token meaningfully changes.
   * Used to scope React Query keys so stale error/data won't persist across step-up cycles.
   */
  sysSessionVersion: number;
  sysAccessToken: string | null;
  sysAccessTokenExpiresAt: number | null;
  hasValidSysToken: () => boolean;
  setSysToken: (token: string, expiresInSeconds: number) => void;
  clearSysToken: () => void;
};
