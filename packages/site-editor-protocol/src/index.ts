import type {
  DocumentIR,
  BlockManifest,
  BlockPattern,
  PortableTextContent,
} from "@celestial/site-block-protocol";

export type EditorProtocolVersion = 1;

export type EditorOverlayMode = "off" | "inspect" | "edit";

export type EditorViewMode = "edit" | "preview";

export type EditorDevicePreset = "desktop" | "tablet" | "mobile";

export type EditorDimensionValue = number | string;

export type EditorSizingMode = "fit" | "fixed";

export type EditorCanvasPreferences = {
  showRulers: boolean;
  showGuides: boolean;
  showBounds: boolean;
  showCanvasIndications: boolean;
  sizingMode: EditorSizingMode;
};

export type EditorCanvasState = {
  devicePreset: EditorDevicePreset;
  zoomPercent: number;
  preferences: EditorCanvasPreferences;
};

export type EditorHistoryState = {
  canUndo: boolean;
  canRedo: boolean;
  undoDepth: number;
  redoDepth: number;
};

export type BlockId = string;

export type RpcRequestId = string;

export type EditorInspectorComponent = Record<string, unknown>;

export type EditorInspectorLayout = Record<string, unknown>;

export type EditorInspectorDesign = Record<string, unknown>;

export type EditorInspectorAnimation = Record<string, unknown>;

export type EditorSelectionInspector = {
  blockId: BlockId | null;
  blockType: string | null;
  component: EditorInspectorComponent;
  layout: EditorInspectorLayout;
  design: EditorInspectorDesign;
  animation: EditorInspectorAnimation;
};

export type EditorSelectionPatchSection = "component" | "layout" | "design" | "animation";

export type EditorSelectionPatch = {
  section: EditorSelectionPatchSection;
  values: Record<string, unknown>;
};

export type EditorLayerNode = {
  id: BlockId;
  type: string;
  label: string;
  children: EditorLayerNode[];
};

/**
 * Block type identifier for insertion.
 * Registry-driven: any string registered in BlockRegistry is valid.
 */
export type EditorInsertBlockType = string;

export type EditorInsertBlockPosition = "inside" | "after" | "before";

export type EditorInsertBlockArgs = {
  type: EditorInsertBlockType;
  targetBlockId?: BlockId | null;
  position?: EditorInsertBlockPosition;
};

export type EditorInsertBlockResult = {
  blockId: BlockId;
  inspector: EditorSelectionInspector;
  layers: EditorLayerNode[];
};

export type EditorPresence = {
  siteId: string;
  pathname: string;
  overlayMode: EditorOverlayMode;
  selectedBlockId: BlockId | null;
  hasDraftOverride: boolean;
  canvasState?: EditorCanvasState;
  updatedAtMs: number;
};

export type PortalEditorMessageEnvelope<T extends string, Payload> = {
  version: EditorProtocolVersion;
  type: T;
  requestId?: RpcRequestId;
  payload: Payload;
};

// Admin -> Portal (iframe)
export type HostToPortalMessage =
  | PortalEditorMessageEnvelope<
      "PING",
      {
        sentAt: number;
      }
    >
  | PortalEditorMessageEnvelope<
      "SET_OVERLAY_MODE",
      {
        mode: EditorOverlayMode;
      }
    >
  | PortalEditorMessageEnvelope<
      "SELECT_BLOCK",
      {
        blockId: BlockId | null;
      }
    >
  | PortalEditorMessageEnvelope<
      "PUSH_DRAFT_DOCUMENT",
      {
        document: DocumentIR;
      }
    >;

// Portal (iframe) -> Admin
export type PortalToHostMessage =
  | PortalEditorMessageEnvelope<
      "READY",
      {
        readyAt: number;
      }
    >
  | PortalEditorMessageEnvelope<
      "PONG",
      {
        receivedAt: number;
      }
    >
  | PortalEditorMessageEnvelope<
      "SELECTION_CHANGED",
      {
        blockId: BlockId | null;
      }
    >;

export type AnyEditorMessage = HostToPortalMessage | PortalToHostMessage;

/**
 * Penpal RPC APIs.
 *
 * We keep the message-based protocol for debugging and low-level transports,
 * but prefer method-based RPC between Admin(host) and Portal(iframe) for readability.
 */
export type PortalEditorRpcApi = {
  getProtocolVersion: () => EditorProtocolVersion;
  ping: (args: { sentAt: number }) => { receivedAt: number };
  setOverlayMode: (args: { mode: EditorOverlayMode }) => void;
  selectBlock: (args: { blockId: BlockId | null }) => void;
  /**
   * Push a draft document override for instant preview.
   *
   * When `pathname` is provided, the portal editor mode may ignore the update
   * if it does not match the currently rendered route. This prevents accidental
   * cross-page draft overwrites when the host shell navigates quickly.
   */
  pushDraftDocument: (args: { document: DocumentIR; pathname?: string }) => void;
  undo: () => EditorHistoryState;
  redo: () => EditorHistoryState;
  getHistoryState: () => EditorHistoryState;
  getSelectionInspector: () => EditorSelectionInspector;
  applySelectionPatch: (args: {
    patch: EditorSelectionPatch;
    commit?: "immediate" | "debounced";
  }) => EditorSelectionInspector;
  getLayerTree: () => EditorLayerNode[];
  insertBlock: (args: EditorInsertBlockArgs) => EditorInsertBlockResult;
  setDevicePreset: (args: { devicePreset: EditorDevicePreset }) => EditorCanvasState;
  setZoom: (args: { zoomPercent: number }) => EditorCanvasState;
  resetZoom: () => EditorCanvasState;
  setCanvasPreferences: (args: { preferences: Partial<EditorCanvasPreferences> }) => EditorCanvasState;
  getCanvasState: () => EditorCanvasState;

  // --- Block registry & patterns ---
  getAvailableBlocks: () => BlockManifest[];
  getBlockPatterns: (args: { category?: string }) => BlockPattern[];

  // --- Block manipulation ---
  moveBlock: (args: {
    blockId: BlockId;
    targetId: BlockId;
    position: "before" | "after" | "inside";
  }) => EditorLayerNode[];
  deleteBlock: (args: { blockId: BlockId }) => EditorLayerNode[];
  duplicateBlock: (args: { blockId: BlockId }) => EditorInsertBlockResult;

  // --- Responsive ---
  setBreakpointOverride: (args: {
    blockId: BlockId;
    breakpoint: string;
    patch: EditorSelectionPatch;
  }) => EditorSelectionInspector;

  // --- Inline editing ---
  startInlineEdit: (args: { blockId: BlockId; fieldKey: string }) => { content: PortableTextContent };
  commitInlineEdit: (args: { blockId: BlockId; fieldKey: string; content: PortableTextContent }) => void;
};

export type HostEditorRpcApi = {
  ready: (args: { readyAt: number }) => void;
  selectionChanged: (args: { blockId: BlockId | null }) => void;

  /**
   * Portal notifies the host that a save should happen (e.g. Cmd+S inside the iframe).
   *
   * The host decides what save means.
   */
  requestSave: (args: { siteId: string; pathname: string; document: DocumentIR }) => void;

  /**
   * Presence channel allows the portal iframe to report editor presence
   * without coupling the host UI to portal internals.
   */
  reportPresence: (args: { presence: EditorPresence }) => void;

  historyChanged?: (args: EditorHistoryState) => void;
  canvasChanged?: (args: { canvas: EditorCanvasState }) => void;
  selectionInspectorChanged?: (args: { inspector: EditorSelectionInspector }) => void;
  layerTreeChanged?: (args: { layers: EditorLayerNode[] }) => void;
};

export type { DndItemKind, DndNewBlockItem, DndExistingBlockItem, DndItem, DndDropTarget, DndDropResult } from "./dnd";
