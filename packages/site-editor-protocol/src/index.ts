import type {
  BlockNode,
  BlockManifest,
  BlockPattern,
  PortableTextContent,
  DesignDocumentV1,
  DesignNodeId,
  DesignNodeV1,
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

/**
 * Editor-level node identifier.
 *
 * 注意：阶段 1-3 起，编辑器的真相源是 DesignDocument（nodesById），因此这里的 BlockId 实际上是 NodeId。
 * 为减少迁移成本（以及保持 Host/Portal 协议的兼容性），暂时沿用 BlockId 命名。
 */
export type BlockId = DesignNodeId;

export type RpcRequestId = string;

// 迁移说明：DesignDocument 已有真实的 page_root 节点（document.rootId），不再需要虚拟 root id。
// 该常量保留仅用于兼容旧代码路径，避免一次性大改。
export const EDITOR_PAGE_ROOT_BLOCK_ID = "page";

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

export type EditorInsertBlockTreeArgs = {
  targetBlockId?: BlockId | null;
  position?: EditorInsertBlockPosition;
} & (
  | {
      /**
       * Legacy insertion tree (DocumentIR-style block subtree).
       * Portal side will convert blocks -> DesignDocument nodes before insertion.
       */
      blocks: BlockNode[];
    }
  | {
      /**
       * DesignDocument fragment insertion (preferred).
       *
       * 约束：
       * - rootIds 必须存在于 nodesById
       * - nodesById 内部引用必须闭合（child id / slotChildren id）
       */
      rootIds: DesignNodeId[];
      nodesById: Record<DesignNodeId, DesignNodeV1>;
    }
);

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
        document: DesignDocumentV1;
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
  pushDraftDocument: (args: { document: DesignDocumentV1; pathname?: string }) => void;
  /** Return the current in-memory document (including unsaved edits). */
  getDocument: () => DesignDocumentV1;
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
  insertBlockTree: (args: EditorInsertBlockTreeArgs) => EditorInsertBlockResult;
  /** Insert a content_ref node. */
  insertContentRef: (args: {
    refEntryId: string;
    refState?: "draft" | "published" | "auto";
    targetBlockId?: BlockId | null;
    position?: EditorInsertBlockPosition;
  }) => EditorInsertBlockResult;
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
   * Wheel events that happen inside the portal iframe (cross-origin safe).
   *
   * Browsers do not reliably bubble iframe-internal wheel events to the host document, so the portal
   * forwards them to the host for unified canvas pan/zoom behavior.
   */
  canvasWheel?: (args: {
    deltaX: number;
    deltaY: number;
    deltaMode: number;
    ctrlKey: boolean;
    metaKey: boolean;
    shiftKey: boolean;
    /** iframe viewport clientX */
    clientX: number;
    /** iframe viewport clientY */
    clientY: number;
  }) => void;

  /**
   * Portal notifies the host that a save should happen (e.g. Cmd+S inside the iframe).
   *
   * The host decides what save means.
   */
  requestSave: (args: { siteId: string; pathname: string; document: DesignDocumentV1 }) => void;
  /** Request the host to open a content entry editor in a new tab/route. */
  requestEditContentRef: (args: { refEntryId: string; refEntryTitle?: string }) => void;

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
