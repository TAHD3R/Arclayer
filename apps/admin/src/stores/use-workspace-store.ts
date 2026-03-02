import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { STORAGE_KEYS } from "@/constants/storage";
import type { WorkspaceState } from "@/types/stores";

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set) => ({
      currentWorkspaceId: null,
      lastWorkspaceId: null,
      setCurrentWorkspaceId: (workspaceId) =>
        set((s) => ({
          currentWorkspaceId: workspaceId || null,
          lastWorkspaceId: workspaceId || s.lastWorkspaceId,
        })),
      setLastWorkspaceId: (workspaceId) => set({ lastWorkspaceId: workspaceId || null }),
      clearWorkspace: () => set({ currentWorkspaceId: null, lastWorkspaceId: null }),
    }),
    {
      name: STORAGE_KEYS.workspace,
      storage: createJSONStorage(() => localStorage),
      version: 1,
      partialize: (s) => ({ lastWorkspaceId: s.lastWorkspaceId }),
    },
  ),
);
