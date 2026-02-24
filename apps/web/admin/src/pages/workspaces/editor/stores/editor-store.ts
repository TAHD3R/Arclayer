import { create } from "zustand";

import type { EditorLayerNode, EditorSelectionInspector } from "@celestial/site-editor-protocol";

import type { BridgeStatus } from "@/pages/workspaces/editor/hooks/use-editor-bridge";

// --- Menu IDs for ActivityBar ---

export type ActivityBarMenuId =
  | "pages"
  | "navigator"
  | "components"
  | "blocks"
  | "assets"
  | "plugins"
  | "settings"
  | "search";

export type PropertiesPanelTab = "component" | "layout" | "design" | "animation";
export type DevicePreset = "desktop" | "tablet" | "mobile";

export type RulerMode = "off" | "ruler" | "ruler-crosshair";

export interface EditorState {
  // Left panel (ActivityBar + Sidebar)
  activeMenuId: ActivityBarMenuId | null;
  sidebarOpen: boolean;

  // Right panel (Properties)
  propertiesPanelOpen: boolean;
  propertiesPanelTab: PropertiesPanelTab;

  // Canvas
  devicePreset: DevicePreset;
  zoomPercent: number;
  canvasWidth: number | null;
  rulerMode: RulerMode;
  showLineGuides: boolean;

  // Selection
  selectedBlockId: string | null;
  hoveredBlockId: string | null;

  // Document state
  isDirty: boolean;
  isSaving: boolean;
  isPublishing: boolean;

  // Auto-save configuration
  autoSaveEnabled: boolean;
  autoSaveIntervalSec: number;
  saveOnBlur: boolean;

  // History
  canUndo: boolean;
  canRedo: boolean;

  // Bridge
  bridgeStatus: BridgeStatus;

  // RPC synced data
  inspectorData: EditorSelectionInspector;
  layerTree: EditorLayerNode[];

  // Actions
  setActiveMenuId: (id: ActivityBarMenuId | null) => void;
  toggleSidebar: () => void;
  togglePropertiesPanel: () => void;
  setPropertiesPanelTab: (tab: PropertiesPanelTab) => void;
  setDevicePreset: (preset: DevicePreset) => void;
  setZoomPercent: (zoom: number) => void;
  setCanvasWidth: (width: number | null) => void;
  setRulerMode: (mode: RulerMode) => void;
  setShowLineGuides: (show: boolean) => void;
  setSelectedBlockId: (id: string | null) => void;
  setHoveredBlockId: (id: string | null) => void;
  setDirty: (dirty: boolean) => void;
  setSaving: (saving: boolean) => void;
  setPublishing: (publishing: boolean) => void;
  setAutoSaveEnabled: (enabled: boolean) => void;
  setAutoSaveIntervalSec: (sec: number) => void;
  setSaveOnBlur: (enabled: boolean) => void;
  setHistoryState: (state: { canUndo: boolean; canRedo: boolean }) => void;
  setBridgeStatus: (status: BridgeStatus) => void;
  setInspectorData: (data: EditorSelectionInspector) => void;
  setLayerTree: (tree: EditorLayerNode[]) => void;
}

const EMPTY_INSPECTOR: EditorSelectionInspector = {
  blockId: null,
  blockType: null,
  component: {},
  layout: {},
  design: {},
  animation: {},
};

export const useEditorStore = create<EditorState>()((set) => ({
  activeMenuId: "pages",
  sidebarOpen: true,

  propertiesPanelOpen: true,
  propertiesPanelTab: "component",

  devicePreset: "desktop",
  zoomPercent: 100,
  canvasWidth: null,
  rulerMode: "off",
  showLineGuides: false,

  selectedBlockId: null,
  hoveredBlockId: null,

  isDirty: false,
  isSaving: false,
  isPublishing: false,

  autoSaveEnabled: false,
  autoSaveIntervalSec: 30,
  saveOnBlur: true,

  canUndo: false,
  canRedo: false,

  bridgeStatus: "disconnected",

  inspectorData: EMPTY_INSPECTOR,
  layerTree: [],

  setActiveMenuId: (id) =>
    set((s) => {
      // Click same item → toggle sidebar; click different → open + switch
      if (id === s.activeMenuId) {
        return { sidebarOpen: !s.sidebarOpen };
      }
      return { activeMenuId: id, sidebarOpen: true };
    }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  togglePropertiesPanel: () => set((s) => ({ propertiesPanelOpen: !s.propertiesPanelOpen })),
  setPropertiesPanelTab: (tab) => set({ propertiesPanelTab: tab, propertiesPanelOpen: true }),
  setDevicePreset: (preset) => set({ devicePreset: preset }),
  setZoomPercent: (zoom) => set({ zoomPercent: Math.max(25, Math.min(200, Math.round(zoom))) }),
  setCanvasWidth: (width) => set({ canvasWidth: width }),
  setRulerMode: (mode) => set({ rulerMode: mode }),
  setShowLineGuides: (show) => set({ showLineGuides: show }),
  setSelectedBlockId: (id) => set({ selectedBlockId: id }),
  setHoveredBlockId: (id) => set({ hoveredBlockId: id }),
  setDirty: (dirty) => set({ isDirty: dirty }),
  setSaving: (saving) => set({ isSaving: saving }),
  setPublishing: (publishing) => set({ isPublishing: publishing }),
  setAutoSaveEnabled: (enabled) => set({ autoSaveEnabled: enabled }),
  setAutoSaveIntervalSec: (sec) => set({ autoSaveIntervalSec: Math.max(10, Math.min(300, sec)) }),
  setSaveOnBlur: (enabled) => set({ saveOnBlur: enabled }),
  setHistoryState: ({ canUndo, canRedo }) => set({ canUndo, canRedo }),
  setBridgeStatus: (status) => set({ bridgeStatus: status }),
  setInspectorData: (data) => set({ inspectorData: data }),
  setLayerTree: (tree) => set({ layerTree: tree }),
}));
