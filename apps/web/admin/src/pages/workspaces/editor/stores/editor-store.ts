import { create } from "zustand";

export type LeftPanelTab = "elements" | "layers" | "pages" | "assets";
export type RightPanelTab = "component" | "layout" | "design" | "animation";
export type DevicePreset = "desktop" | "tablet" | "mobile";

export interface EditorState {
  // Panel visibility
  leftPanelOpen: boolean;
  rightPanelOpen: boolean;
  leftPanelTab: LeftPanelTab;
  rightPanelTab: RightPanelTab;

  // Canvas
  devicePreset: DevicePreset;
  zoomPercent: number;

  // Selection
  selectedBlockId: string | null;
  hoveredBlockId: string | null;

  // Document state
  isDirty: boolean;
  isSaving: boolean;
  isPublishing: boolean;

  // History
  canUndo: boolean;
  canRedo: boolean;

  // Actions
  toggleLeftPanel: () => void;
  toggleRightPanel: () => void;
  setLeftPanelTab: (tab: LeftPanelTab) => void;
  setRightPanelTab: (tab: RightPanelTab) => void;
  setDevicePreset: (preset: DevicePreset) => void;
  setZoomPercent: (zoom: number) => void;
  setSelectedBlockId: (id: string | null) => void;
  setHoveredBlockId: (id: string | null) => void;
  setDirty: (dirty: boolean) => void;
  setSaving: (saving: boolean) => void;
  setPublishing: (publishing: boolean) => void;
  setHistoryState: (state: { canUndo: boolean; canRedo: boolean }) => void;
}

export const useEditorStore = create<EditorState>()((set) => ({
  leftPanelOpen: true,
  rightPanelOpen: true,
  leftPanelTab: "elements",
  rightPanelTab: "component",

  devicePreset: "desktop",
  zoomPercent: 100,

  selectedBlockId: null,
  hoveredBlockId: null,

  isDirty: false,
  isSaving: false,
  isPublishing: false,

  canUndo: false,
  canRedo: false,

  toggleLeftPanel: () => set((s) => ({ leftPanelOpen: !s.leftPanelOpen })),
  toggleRightPanel: () => set((s) => ({ rightPanelOpen: !s.rightPanelOpen })),
  setLeftPanelTab: (tab) => set({ leftPanelTab: tab, leftPanelOpen: true }),
  setRightPanelTab: (tab) => set({ rightPanelTab: tab, rightPanelOpen: true }),
  setDevicePreset: (preset) => set({ devicePreset: preset }),
  setZoomPercent: (zoom) => set({ zoomPercent: Math.max(25, Math.min(200, Math.round(zoom))) }),
  setSelectedBlockId: (id) => set({ selectedBlockId: id }),
  setHoveredBlockId: (id) => set({ hoveredBlockId: id }),
  setDirty: (dirty) => set({ isDirty: dirty }),
  setSaving: (saving) => set({ isSaving: saving }),
  setPublishing: (publishing) => set({ isPublishing: publishing }),
  setHistoryState: ({ canUndo, canRedo }) => set({ canUndo, canRedo }),
}));
