import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { STORAGE_KEYS } from "@/constants/storage";
import type { WorkspaceState } from "@/types/stores";

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set) => ({
      currentWorkspaceId: null,
      lastWorkspaceId: null,
      currentProjectId: null,
      lastProjectId: null,
      setCurrentWorkspaceId: (workspaceId) =>
        set((s) => ({
          currentWorkspaceId: workspaceId || null,
          lastWorkspaceId: workspaceId || s.lastWorkspaceId,
        })),
      setCurrentProjectId: (projectId) =>
        set((s) => ({
          currentProjectId: projectId || null,
          lastProjectId: projectId || s.lastProjectId,
        })),
      setCurrentContext: ({ workspaceId, projectId }) =>
        set((s) => ({
          currentWorkspaceId: workspaceId || null,
          lastWorkspaceId: workspaceId || s.lastWorkspaceId,
          currentProjectId: projectId || null,
          lastProjectId: projectId || s.lastProjectId,
        })),
      setLastWorkspaceId: (workspaceId) => set({ lastWorkspaceId: workspaceId || null }),
      setLastProjectId: (projectId) => set({ lastProjectId: projectId || null }),
      clearWorkspace: () =>
        set({
          currentWorkspaceId: null,
          lastWorkspaceId: null,
          currentProjectId: null,
          lastProjectId: null,
        }),
    }),
    {
      name: STORAGE_KEYS.workspace,
      storage: createJSONStorage(() => localStorage),
      version: 2,
      partialize: (s) => ({
        lastWorkspaceId: s.lastWorkspaceId,
        lastProjectId: s.lastProjectId,
      }),
    },
  ),
);
