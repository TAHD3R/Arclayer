import { create } from "zustand";

export type EditorMode = "edit" | "preview";

export type ViewportState = {
  width: number;
  height: number;
  mode: EditorMode;
  setViewport: (width: number, height: number) => void;
  setMode: (mode: EditorMode) => void;
};

export const useViewportStore = create<ViewportState>((set) => ({
  width: 1200,
  height: 800,
  mode: "edit",
  setViewport: (width, height) => set({ width, height }),
  setMode: (mode) => set({ mode }),
}));
