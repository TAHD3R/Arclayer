import React from "react";

import { PageBlueprintRenderer } from "@celestial/renderer";

import type { PageBlueprint, ViewerContext } from "@celestial/block-protocol";
import {
  CORE_BLOCK_MANIFESTS,
  CORE_PAGE_BLUEPRINT_PATTERNS_V1,
  PREFAB_BLOCK_MANIFESTS,
  resolveBreakpointNameByWidth,
} from "@celestial/block-protocol";

import type {
  BlockId,
  EditorCanvasPreferences,
  EditorCanvasState,
  EditorHistoryState,
  EditorLayerNode,
  EditorOverlayMode,
  EditorSelectionInspector,
  HostEditorRpcApi,
  PortalEditorRpcApi,
} from "@celestial/editor-protocol";
import type { EditorPortalPenpalConnection } from "@celestial/editor-bridge";
import { connectEditorPortalToHost, isHttpOrigin } from "@celestial/editor-bridge";

import {
  applySelectionPatch,
  buildLayerTree,
  buildSelectionInspector,
  commitEditorHistory,
  createEditorHistory,
  deleteBlock,
  duplicateBlockWithMeta,
  insertBlockTreeWithMeta,
  insertBlockWithMeta,
  insertContentRefWithMeta,
  moveBlock,
  normalizeInitialDocument,
  redoEditorHistory,
  setBreakpointOverride,
  toEditorHistoryState,
  undoEditorHistory,
} from "@/views/editor/editor-document-state";

export interface EditorSiteViewProps {
  initialDocument: unknown;
  viewerCtx: ViewerContext;
  pathname: string;
  siteId: string;
}

const DEFAULT_CANVAS_STATE: EditorCanvasState = {
  devicePreset: "desktop",
  zoomPercent: 100,
  preferences: {
    showRulers: false,
    showGuides: false,
    showBounds: true,
    showCanvasIndications: true,
    sizingMode: "fit",
  },
};

type HostOptionalEvents = {
  historyChanged?: (args: EditorHistoryState) => void;
  canvasChanged?: (args: { canvas: EditorCanvasState }) => void;
  selectionInspectorChanged?: (args: { inspector: EditorSelectionInspector }) => void;
  layerTreeChanged?: (args: { layers: EditorLayerNode[] }) => void;
};

function getHostOptionalEvents(
  host: EditorPortalPenpalConnection["host"] | null,
): HostOptionalEvents {
  if (!host) return {};
  return host as unknown as HostOptionalEvents;
}

function clampZoomPercent(value: number): number {
  if (!Number.isFinite(value)) return 100;
  return Math.min(200, Math.max(25, Math.round(value)));
}

function getParentOriginFromSearch(): string | null {
  if (typeof window === "undefined") return null;
  const url = new URL(window.location.href);
  const raw = url.searchParams.get("parentOrigin");
  const origin = (raw || "").trim();
  if (!origin) return null;
  return isHttpOrigin(origin) ? origin : null;
}

export function EditorSiteView(props: EditorSiteViewProps) {
  const { initialDocument: initialDocumentUnknown, viewerCtx, pathname, siteId } = props;

  const baseDesignDocument = React.useMemo<PageBlueprint>(
    () => normalizeInitialDocument(initialDocumentUnknown),
    [initialDocumentUnknown],
  );

  const [history, setHistory] = React.useState(() =>
    createEditorHistory({ initialDocument: baseDesignDocument }),
  );
  const [hasDraftOverride, setHasDraftOverride] = React.useState(false);
  const [overlayMode, setOverlayMode] = React.useState<EditorOverlayMode>("inspect");
  const [selectedBlockId, setSelectedBlockId] = React.useState<BlockId | null>(null);
  const [canvasState, setCanvasState] = React.useState<EditorCanvasState>(DEFAULT_CANVAS_STATE);

  const hostRef = React.useRef<EditorPortalPenpalConnection["host"] | null>(null);
  const overlayModeRef = React.useRef<EditorOverlayMode>(overlayMode);
  const pathnameRef = React.useRef<string>(pathname);
  const historyRef = React.useRef(history);
  const selectedBlockIdRef = React.useRef<BlockId | null>(selectedBlockId);
  const canvasStateRef = React.useRef<EditorCanvasState>(canvasState);
  const breakpointRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    historyRef.current = history;
  }, [history]);

  React.useEffect(() => {
    selectedBlockIdRef.current = selectedBlockId;
  }, [selectedBlockId]);

  React.useEffect(() => {
    canvasStateRef.current = canvasState;
  }, [canvasState]);

  React.useEffect(() => {
    overlayModeRef.current = overlayMode;
  }, [overlayMode]);

  React.useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  const [viewport, setViewport] = React.useState<{ width: number; height: number }>(() => ({
    width: typeof window === "undefined" ? 1024 : window.innerWidth,
    height: typeof window === "undefined" ? 768 : window.innerHeight,
  }));

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const onResize = () => setViewport({ width: window.innerWidth, height: window.innerHeight });
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const breakpointFromWidth = React.useMemo(
    () => resolveBreakpointNameByWidth(viewport.width),
    [viewport.width],
  );
  React.useEffect(() => {
    breakpointRef.current = breakpointFromWidth;
  }, [breakpointFromWidth]);

  const renderCtx = React.useMemo<ViewerContext>(
    () => ({ ...viewerCtx, mode: "preview", breakpoint: breakpointFromWidth }),
    [breakpointFromWidth, viewerCtx],
  );

  const syncHistoryState = React.useCallback((state: EditorHistoryState) => {
    getHostOptionalEvents(hostRef.current).historyChanged?.(state);
  }, []);

  const syncLayers = React.useCallback((document: PageBlueprint) => {
    const layers = buildLayerTree(document);
    getHostOptionalEvents(hostRef.current).layerTreeChanged?.({ layers });
    return layers;
  }, []);

  const syncSelectionInspector = React.useCallback(
    (document: PageBlueprint, blockId: BlockId | null) => {
      const inspector = buildSelectionInspector(document, blockId);
      getHostOptionalEvents(hostRef.current).selectionInspectorChanged?.({ inspector });
      return inspector;
    },
    [],
  );

  const commitNextDocument = React.useCallback(
    (nextDocument: PageBlueprint, opts?: { preserveSelection?: boolean }) => {
      const nextHistory = commitEditorHistory(historyRef.current, nextDocument);
      historyRef.current = nextHistory;
      setHistory(nextHistory);
      setHasDraftOverride(true);

      const keep = opts?.preserveSelection ? selectedBlockIdRef.current : null;
      const inspector = syncSelectionInspector(nextDocument, keep);
      if (inspector.blockId !== keep) setSelectedBlockId(inspector.blockId);

      syncHistoryState(toEditorHistoryState(nextHistory));
      syncLayers(nextDocument);
      return inspector;
    },
    [syncHistoryState, syncLayers, syncSelectionInspector],
  );

  const undoFromPortal = React.useCallback((): EditorHistoryState => {
    const nextHistory = undoEditorHistory(historyRef.current);
    historyRef.current = nextHistory;
    setHistory(nextHistory);
    setHasDraftOverride(true);

    syncLayers(nextHistory.present);
    syncSelectionInspector(nextHistory.present, selectedBlockIdRef.current);
    const snapshot = toEditorHistoryState(nextHistory);
    syncHistoryState(snapshot);
    return snapshot;
  }, [syncHistoryState, syncLayers, syncSelectionInspector]);

  const redoFromPortal = React.useCallback((): EditorHistoryState => {
    const nextHistory = redoEditorHistory(historyRef.current);
    historyRef.current = nextHistory;
    setHistory(nextHistory);
    setHasDraftOverride(true);

    syncLayers(nextHistory.present);
    syncSelectionInspector(nextHistory.present, selectedBlockIdRef.current);
    const snapshot = toEditorHistoryState(nextHistory);
    syncHistoryState(snapshot);
    return snapshot;
  }, [syncHistoryState, syncLayers, syncSelectionInspector]);

  const updateCanvas = React.useCallback(
    (updater: (prev: EditorCanvasState) => EditorCanvasState): EditorCanvasState => {
      const next = updater(canvasStateRef.current);
      canvasStateRef.current = next;
      setCanvasState(next);
      getHostOptionalEvents(hostRef.current).canvasChanged?.({ canvas: next });
      return next;
    },
    [],
  );

  // Forward wheel events to the host so canvas pan/zoom works even when the cursor is inside the iframe.
  React.useEffect(() => {
    const onWheel = (ev: WheelEvent) => {
      const host = hostRef.current as unknown as {
        canvasWheel?: HostEditorRpcApi["canvasWheel"];
      } | null;
      if (!host?.canvasWheel) return;
      host.canvasWheel({
        deltaX: ev.deltaX,
        deltaY: ev.deltaY,
        deltaMode: ev.deltaMode,
        ctrlKey: ev.ctrlKey,
        metaKey: ev.metaKey,
        shiftKey: ev.shiftKey,
        clientX: ev.clientX,
        clientY: ev.clientY,
      });
      ev.preventDefault();
    };

    window.addEventListener("wheel", onWheel, { passive: false, capture: true });
    return () => window.removeEventListener("wheel", onWheel, true);
  }, []);

  // Keyboard shortcuts (save/undo/redo).
  React.useEffect(() => {
    if (overlayMode === "off") return;

    const onKeyDown = (ev: KeyboardEvent) => {
      const key = ev.key.toLowerCase();
      const isMeta = ev.ctrlKey || ev.metaKey;

      const isSave = isMeta && key === "s";
      if (isSave) {
        ev.preventDefault();
        ev.stopPropagation();
        void hostRef.current?.requestSave({
          siteId,
          pathname,
          document: historyRef.current.present,
        });
        return;
      }

      // Keep undo/redo local when typing inside inputs.
      const target = ev.target;
      const isTyping =
        target instanceof HTMLElement &&
        Boolean(
          target.closest(
            "textarea,input,[contenteditable='true'],[data-editor-inline-input='true']",
          ),
        );

      const isUndo = isMeta && !ev.shiftKey && key === "z";
      if (isUndo) {
        if (isTyping) return;
        ev.preventDefault();
        ev.stopPropagation();
        undoFromPortal();
        return;
      }

      const isRedo = (isMeta && ev.shiftKey && key === "z") || (ev.ctrlKey && key === "y");
      if (isRedo) {
        if (isTyping) return;
        ev.preventDefault();
        ev.stopPropagation();
        redoFromPortal();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [overlayMode, pathname, redoFromPortal, siteId, undoFromPortal]);

  // Connect to host (Penpal RPC).
  React.useEffect(() => {
    let mounted = true;
    let destroy: (() => void) | null = null;

    if (!window.parent || window.parent === window) return () => {};

    const parentOrigin = getParentOriginFromSearch() ?? window.location.origin;

    const methods: PortalEditorRpcApi = {
      getProtocolVersion: () => 1,
      ping: () => ({ receivedAt: Date.now() }),
      setOverlayMode: ({ mode }) => {
        setOverlayMode(mode);
        if (mode === "off") setSelectedBlockId(null);
      },
      selectBlock: ({ blockId }) => {
        if (overlayModeRef.current === "off") return;
        setSelectedBlockId(blockId);
      },

      // Document APIs
      getDocument: () => historyRef.current.present,
      pushDraftDocument: ({ document, pathname: incomingPathname }) => {
        if (incomingPathname && incomingPathname !== pathnameRef.current) return;
        const nextDocument = normalizeInitialDocument(document);
        const nextHistory = createEditorHistory({ initialDocument: nextDocument });
        historyRef.current = nextHistory;
        setHistory(nextHistory);
        setHasDraftOverride(true);
        setSelectedBlockId(null);
        syncHistoryState(toEditorHistoryState(nextHistory));
        syncLayers(nextHistory.present);
        syncSelectionInspector(nextHistory.present, null);
      },

      // History
      undo: () => undoFromPortal(),
      redo: () => redoFromPortal(),
      getHistoryState: () => toEditorHistoryState(historyRef.current),

      // Inspector
      getSelectionInspector: () =>
        buildSelectionInspector(historyRef.current.present, selectedBlockIdRef.current),
      applySelectionPatch: ({ patch }) => {
        const out = applySelectionPatch({
          document: historyRef.current.present,
          blockId: selectedBlockIdRef.current,
          patch,
        });
        if (out.document !== historyRef.current.present) {
          return commitNextDocument(out.document, { preserveSelection: true });
        }
        return syncSelectionInspector(historyRef.current.present, selectedBlockIdRef.current);
      },

      // Layers
      getLayerTree: () => buildLayerTree(historyRef.current.present),

      // Insertions
      insertBlock: (args) => {
        const inserted = insertBlockWithMeta({
          document: historyRef.current.present,
          insert: {
            ...args,
            targetBlockId: args.targetBlockId ?? selectedBlockIdRef.current,
          },
        });
        const inspector = commitNextDocument(inserted.document, { preserveSelection: false });
        setSelectedBlockId(inserted.selectedId || null);
        return {
          blockId: inserted.selectedId,
          inspector,
          layers: inserted.layers,
        };
      },
      insertBlockTree: (args) => {
        const inserted = insertBlockTreeWithMeta({
          document: historyRef.current.present,
          insert: {
            ...args,
            targetBlockId: args.targetBlockId ?? selectedBlockIdRef.current,
          },
        });
        const inspector = commitNextDocument(inserted.document, { preserveSelection: false });
        setSelectedBlockId(inserted.selectedId || null);
        return {
          blockId: inserted.selectedId,
          inspector,
          layers: inserted.layers,
        };
      },
      insertContentRef: (args) => {
        const inserted = insertContentRefWithMeta({
          document: historyRef.current.present,
          insert: {
            ...args,
            targetBlockId: args.targetBlockId ?? selectedBlockIdRef.current,
          },
        });
        const inspector = commitNextDocument(inserted.document, { preserveSelection: false });
        setSelectedBlockId(inserted.selectedId || null);
        return {
          blockId: inserted.selectedId,
          inspector,
          layers: inserted.layers,
        };
      },

      // Canvas
      setDevicePreset: ({ devicePreset }) => updateCanvas((prev) => ({ ...prev, devicePreset })),
      setZoom: ({ zoomPercent }) =>
        updateCanvas((prev) => ({ ...prev, zoomPercent: clampZoomPercent(zoomPercent) })),
      resetZoom: () => updateCanvas((prev) => ({ ...prev, zoomPercent: 100 })),
      setCanvasPreferences: ({ preferences }) =>
        updateCanvas((prev) => ({
          ...prev,
          preferences: { ...prev.preferences, ...preferences } as EditorCanvasPreferences,
        })),
      getCanvasState: () => canvasStateRef.current,

      // Registry & patterns
      getAvailableBlocks: () => [...CORE_BLOCK_MANIFESTS, ...PREFAB_BLOCK_MANIFESTS],
      getBlockPatterns: ({ category }) =>
        category
          ? CORE_PAGE_BLUEPRINT_PATTERNS_V1.filter((p) => p.category === category)
          : CORE_PAGE_BLUEPRINT_PATTERNS_V1,

      // Manipulation
      moveBlock: ({ blockId, targetId, position }) => {
        const moved = moveBlock({
          document: historyRef.current.present,
          blockId,
          targetId,
          position,
        });
        if (moved.document !== historyRef.current.present) {
          commitNextDocument(moved.document, { preserveSelection: true });
          setSelectedBlockId(blockId);
        }
        return moved.layers;
      },
      deleteBlock: ({ blockId }) => {
        const deleted = deleteBlock({ document: historyRef.current.present, blockId });
        if (deleted.document !== historyRef.current.present) {
          commitNextDocument(deleted.document, { preserveSelection: false });
          setSelectedBlockId(null);
        }
        return deleted.layers;
      },
      duplicateBlock: ({ blockId }) => {
        const duplicated = duplicateBlockWithMeta({
          document: historyRef.current.present,
          blockId,
        });
        const inspector = commitNextDocument(duplicated.document, { preserveSelection: false });
        setSelectedBlockId(duplicated.selectedId || null);
        return {
          blockId: duplicated.selectedId,
          inspector,
          layers: duplicated.layers,
        };
      },

      // Responsive overrides
      setBreakpointOverride: ({ blockId, breakpoint, patch }) => {
        const resolved = blockId ?? selectedBlockIdRef.current;
        if (!resolved) return buildSelectionInspector(historyRef.current.present, null);
        const next = setBreakpointOverride({
          document: historyRef.current.present,
          blockId: resolved,
          breakpoint,
          patch,
        });
        if (next.document !== historyRef.current.present) {
          commitNextDocument(next.document, { preserveSelection: true });
        } else {
          syncSelectionInspector(historyRef.current.present, resolved);
        }
        return next.inspector;
      },

      // Inline editing (not implemented in v1 editor)
      startInlineEdit: () => ({ content: [] }),
      commitInlineEdit: () => {},
    };

    void (async () => {
      const conn = await connectEditorPortalToHost({ methods, parentOrigin });
      if (!mounted) {
        conn.destroy();
        return;
      }
      destroy = conn.destroy;
      hostRef.current = conn.host;
      await conn.host.ready({ readyAt: Date.now() });
      syncHistoryState(toEditorHistoryState(historyRef.current));
      syncLayers(historyRef.current.present);
      syncSelectionInspector(historyRef.current.present, selectedBlockIdRef.current);
      getHostOptionalEvents(conn.host).canvasChanged?.({ canvas: canvasStateRef.current });
    })();

    return () => {
      mounted = false;
      hostRef.current = null;
      destroy?.();
    };
  }, [
    commitNextDocument,
    redoFromPortal,
    syncHistoryState,
    syncLayers,
    syncSelectionInspector,
    undoFromPortal,
    updateCanvas,
  ]);

  React.useEffect(() => {
    void hostRef.current?.selectionChanged({ blockId: selectedBlockId });
    syncSelectionInspector(history.present, selectedBlockId);
  }, [history.present, selectedBlockId, syncSelectionInspector]);

  React.useEffect(() => {
    const presence = {
      siteId,
      pathname,
      overlayMode,
      selectedBlockId,
      hasDraftOverride,
      canvasState,
      updatedAtMs: Date.now(),
    };

    const timer = window.setTimeout(() => {
      void hostRef.current?.reportPresence({ presence });
    }, 120);
    return () => window.clearTimeout(timer);
  }, [canvasState, hasDraftOverride, overlayMode, pathname, selectedBlockId, siteId]);

  return (
    <div data-celestial="portal-editor-root" style={{ width: "100%", height: "100%" }}>
      <PageBlueprintRenderer
        document={history.present}
        ctx={renderCtx}
        viewport={{
          width: viewport.width,
          height: viewport.height,
          baseWidth: 1440,
          baseHeight: viewport.height,
        }}
        dataSources={{
          ...(renderCtx.routeParams ? { routeParams: renderCtx.routeParams } : {}),
          viewer: Object.assign(
            {},
            { locale: String(renderCtx.locale) },
            renderCtx.fallbackLocale ? { fallbackLocale: String(renderCtx.fallbackLocale) } : {},
            renderCtx.breakpoint ? { breakpoint: String(renderCtx.breakpoint) } : {},
            renderCtx.mode ? { mode: String(renderCtx.mode) } : {},
          ),
        }}
      />
    </div>
  );
}
