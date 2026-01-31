import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { STORAGE_KEYS } from "@/constants/storage";

export interface OrgState {
  /**
   * Selected organization id (UUID) for org-scoped requests.
   *
   * Backend strategy:
   * - When user belongs to multiple orgs and `X-Org-Id` is missing, backend may return 409 ORG_SELECTION_REQUIRED.
   * - Persisting this value avoids post-login authz checks and admin routes failing for multi-org users.
   */
  currentOrgId: string | null;
  setCurrentOrgId: (orgId: string | null) => void;
  clearCurrentOrg: () => void;
}

export const useOrgStore = create<OrgState>()(
  persist(
    (set) => ({
      currentOrgId: null,
      setCurrentOrgId: (currentOrgId) => set({ currentOrgId: currentOrgId || null }),
      clearCurrentOrg: () => set({ currentOrgId: null }),
    }),
    {
      name: STORAGE_KEYS.currentOrg,
      storage: createJSONStorage(() => localStorage),
      version: 1,
      partialize: (s) => ({ currentOrgId: s.currentOrgId }),
    },
  ),
);
