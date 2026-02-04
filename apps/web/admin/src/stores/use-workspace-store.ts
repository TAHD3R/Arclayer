import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { STORAGE_KEYS } from "@/constants/storage";

export interface WorkspaceState {
  /**
   * 当前激活的工作区（通常由路由参数 /w/:workspaceId 决定）。
   *
   * 说明：
   * - 该值用于“当前页面 API 调用的 workspace_id”以及 UI（如切换器/面包屑）展示。
   * - 源头应该是 URL，而不是本地缓存；本地只持久化 lastWorkspaceId 用于 1B 默认进入。
   */
  currentWorkspaceId: string | null;

  /**
   * 最近访问/默认工作区（持久化）。
   *
   * 用途：
   * - 1B 策略：登录后进入 "/" 时，优先重定向到 lastWorkspaceId（若仍可访问）。
   * - Self-host 常见只有 1 个工作区：当 workspaces.length === 1 时可自动覆盖此值。
   */
  lastWorkspaceId: string | null;

  setCurrentWorkspaceId: (workspaceId: string | null) => void;
  setLastWorkspaceId: (workspaceId: string | null) => void;
  clearWorkspace: () => void;
}

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set) => ({
      currentWorkspaceId: null,
      lastWorkspaceId: null,
      setCurrentWorkspaceId: (workspaceId) =>
        set((s) => ({
          currentWorkspaceId: workspaceId || null,
          // When current changes, treat it as "last used" for 1B default entry.
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
