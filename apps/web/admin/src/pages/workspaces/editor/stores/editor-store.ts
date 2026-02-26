import { create } from "zustand";

import type { EditorLayerNode, EditorSelectionInspector } from "@celestial/site-editor-protocol";

import type { BridgeStatus } from "@/pages/workspaces/editor/hooks/use-editor-bridge";

// --- Menu IDs for ActivityBar ---

export type ActivityBarMenuId =
  | "add-elements"
  | "navigator"
  | "pages"
  | "assets"
  | "blocks"
  | "plugins"
  | "settings"
  | "search";

export type ActiveTool = "select" | "hand";

export type PropertiesPanelTab = "component" | "layout" | "design" | "animation";
export type DevicePreset = "desktop" | "tablet" | "mobile";

export type RulerMode = "off" | "ruler" | "ruler-crosshair";

export interface EditorState {
  // Left panel (ActivityBar + Sidebar)
  activeMenuId: ActivityBarMenuId | null;
  sidebarOpen: boolean;
  sidebarWidthByMenu: Partial<Record<ActivityBarMenuId, number>>;

  // Right panel (Properties)
  propertiesPanelOpen: boolean;
  propertiesPanelTab: PropertiesPanelTab;

  // Overlay close signal (e.g. close popovers when iframe receives focus)
  overlayCloseSignal: number;

  // Canvas
  activeTool: ActiveTool;
  devicePreset: DevicePreset;
  zoomPercent: number;
  canvasWidth: number | null;
  canvasPanX: number;
  canvasPanY: number;
  rulerMode: RulerMode;
  showLineGuides: boolean;

  // Preview
  isPreviewMode: boolean;

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

  // Bridge
  bridgeStatus: BridgeStatus;

  // RPC synced data
  inspectorData: EditorSelectionInspector;
  layerTree: EditorLayerNode[];

  // Actions
  setActiveMenuId: (id: ActivityBarMenuId | null) => void;
  toggleSidebar: () => void;
  setSidebarWidth: (menuId: ActivityBarMenuId, width: number) => void;
  togglePropertiesPanel: () => void;
  setPropertiesPanelTab: (tab: PropertiesPanelTab) => void;
  emitOverlayCloseSignal: () => void;
  setDevicePreset: (preset: DevicePreset) => void;
  setActiveTool: (tool: ActiveTool) => void;
  setZoomPercent: (zoom: number) => void;
  setCanvasWidth: (width: number | null) => void;
  setCanvasPan: (x: number, y: number) => void;
  resetCanvasPan: () => void;
  setRulerMode: (mode: RulerMode) => void;
  setShowLineGuides: (show: boolean) => void;
  togglePreviewMode: () => void;
  setSelectedBlockId: (id: string | null) => void;
  setHoveredBlockId: (id: string | null) => void;
  setDirty: (dirty: boolean) => void;
  setSaving: (saving: boolean) => void;
  setPublishing: (publishing: boolean) => void;
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
  activeMenuId: "add-elements",
  sidebarOpen: true,
  sidebarWidthByMenu: {
    "add-elements": 280,
    navigator: 280,
    pages: 280,
    assets: 360,
    blocks: 320,
    plugins: 280,
    search: 320,
    settings: 420,
  },

  propertiesPanelOpen: true,
  propertiesPanelTab: "component",

  overlayCloseSignal: 0,

  activeTool: "select",
  devicePreset: "desktop",
  zoomPercent: 100,
  canvasWidth: null,
  canvasPanX: 0,
  canvasPanY: 0,
  rulerMode: "off",
  showLineGuides: false,

  isPreviewMode: false,

  selectedBlockId: null,
  hoveredBlockId: null,

  isDirty: false,
  isSaving: false,
  isPublishing: false,

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
  setSidebarWidth: (menuId, width) =>
    set((s) => ({
      sidebarWidthByMenu: {
        ...s.sidebarWidthByMenu,
        [menuId]: Math.max(240, Math.min(520, Math.round(width))),
      },
    })),
  togglePropertiesPanel: () => set((s) => ({ propertiesPanelOpen: !s.propertiesPanelOpen })),
  setPropertiesPanelTab: (tab) => set({ propertiesPanelTab: tab, propertiesPanelOpen: true }),
  emitOverlayCloseSignal: () => set((s) => ({ overlayCloseSignal: s.overlayCloseSignal + 1 })),
  setDevicePreset: (preset) => set({ devicePreset: preset }),
  setActiveTool: (tool) => set({ activeTool: tool }),
  setZoomPercent: (zoom) => set({ zoomPercent: Math.max(25, Math.min(200, Math.round(zoom))) }),
  setCanvasWidth: (width) => set({ canvasWidth: width }),
  setCanvasPan: (x, y) => set({ canvasPanX: x, canvasPanY: y }),
  resetCanvasPan: () => set({ canvasPanX: 0, canvasPanY: 0, zoomPercent: 100 }),
  setRulerMode: (mode) => set({ rulerMode: mode }),
  setShowLineGuides: (show) => set({ showLineGuides: show }),
  togglePreviewMode: () => set((s) => ({ isPreviewMode: !s.isPreviewMode })),
  setSelectedBlockId: (id) => set({ selectedBlockId: id }),
  setHoveredBlockId: (id) => set({ hoveredBlockId: id }),
  setDirty: (dirty) => set({ isDirty: dirty }),
  setSaving: (saving) => set({ isSaving: saving }),
  setPublishing: (publishing) => set({ isPublishing: publishing }),
  setHistoryState: ({ canUndo, canRedo }) => set({ canUndo, canRedo }),
  setBridgeStatus: (status) => set({ bridgeStatus: status }),
  setInspectorData: (data) => set({ inspectorData: data }),
  setLayerTree: (tree) => set({ layerTree: tree }),
}));
