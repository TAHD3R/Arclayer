import { create } from "zustand";

import type { SysAuthState } from "@/types/stores";

export const useSysAuthStore = create<SysAuthState>()((set, get) => ({
  sysSessionVersion: 0,
  sysAccessToken: null,
  sysAccessTokenExpiresAt: null,

  hasValidSysToken: () => {
    const token = get().sysAccessToken;
    const expiresAt = get().sysAccessTokenExpiresAt;
    if (!token) return false;
    if (!expiresAt) return false;
    return Date.now() < expiresAt;
  },

  setSysToken: (token, expiresInSeconds) =>
    set((prev) => ({
      sysAccessToken: token,
      sysAccessTokenExpiresAt: Date.now() + Math.max(1, expiresInSeconds) * 1000,
      sysSessionVersion: prev.sysSessionVersion + 1,
    })),

  clearSysToken: () =>
    set((prev) => ({
      sysAccessToken: null,
      sysAccessTokenExpiresAt: null,
      sysSessionVersion: prev.sysSessionVersion + 1,
    })),
}));
