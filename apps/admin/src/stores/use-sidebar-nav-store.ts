import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { STORAGE_KEYS } from "@/constants/storage";

type SidebarNavState = {
  collapsedKeys: string[];
  toggleCollapsed: (key: string) => void;
  expand: (keys: readonly string[]) => void;
};

export const navGroupCollapseKey = (key: string) => `group:${key}`;
export const navSectionCollapseKey = (key: string) => `section:${key}`;

export const useSidebarNavStore = create<SidebarNavState>()(
  persist(
    (set) => ({
      collapsedKeys: [],
      toggleCollapsed: (key) =>
        set((state) => ({
          collapsedKeys: state.collapsedKeys.includes(key)
            ? state.collapsedKeys.filter((item) => item !== key)
            : [...state.collapsedKeys, key],
        })),
      expand: (keys) =>
        set((state) => {
          const expandedKeys = new Set(keys);
          const collapsedKeys = state.collapsedKeys.filter((key) => !expandedKeys.has(key));
          return collapsedKeys.length === state.collapsedKeys.length ? state : { collapsedKeys };
        }),
    }),
    {
      name: STORAGE_KEYS.sidebarNavCollapsed,
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
