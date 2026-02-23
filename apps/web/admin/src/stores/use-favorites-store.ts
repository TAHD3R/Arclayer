import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

import { STORAGE_KEYS } from "@/constants/storage";

const MAX_FAVORITES = 10;

interface FavoritesState {
  paths: string[];
  toggle: (path: string) => void;
}

export const useFavoritesStore = create<FavoritesState>()(
  persist(
    (set, get) => ({
      paths: [],
      toggle: (path) => {
        const current = get().paths;
        if (current.includes(path)) {
          set({ paths: current.filter((p) => p !== path) });
        } else if (current.length < MAX_FAVORITES) {
          set({ paths: [...current, path] });
        }
      },
    }),
    {
      name: STORAGE_KEYS.favorites,
      storage: createJSONStorage(() => localStorage),
      version: 1,
    },
  ),
);
