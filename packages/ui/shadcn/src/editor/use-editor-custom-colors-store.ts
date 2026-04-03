"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { normalizeColorToHex } from "./mark-color-utils";

const MAX_CUSTOM_COLORS = 8;
const STORAGE_KEY = "arclayer:editor:customColors";

type EditorCustomColorsState = {
  colors: string[];
  addColor: (color: string) => string | null;
  clear: () => void;
};

export const useEditorCustomColorsStore = create<EditorCustomColorsState>()(
  persist(
    (set) => ({
      colors: [],
      addColor: (color) => {
        const normalized = normalizeColorToHex(color);
        if (!normalized) return null;

        set((state) => ({
          colors: [normalized, ...state.colors.filter((item) => item !== normalized)].slice(
            0,
            MAX_CUSTOM_COLORS,
          ),
        }));

        return normalized;
      },
      clear: () => set({ colors: [] }),
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      version: 1,
    },
  ),
);
