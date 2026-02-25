import React from "react";
import { DocumentRenderer } from "@celestial/site-renderer-core";
import type { CoreDocumentIR } from "@celestial/site-renderer-core";
import { isCoreDocumentIR } from "@celestial/site-renderer-core";

import type { ViewerContext } from "@celestial/site-block-protocol";
import type {
  BlockId,
  EditorCanvasState,
  EditorHistoryState,
  EditorLayerNode,
  EditorOverlayMode,
  EditorSelectionInspector,
  PortalEditorRpcApi,
} from "@celestial/site-editor-protocol";
import type { EditorPortalPenpalConnection } from "@celestial/site-editor-bridge";
import { connectEditorPortalToHost, isHttpOrigin } from "@celestial/site-editor-bridge";

import {
  applySelectionPatch,
  buildLayerTree,
  buildSelectionInspector,
  commitEditorHistory,
  createEditorHistory,
  insertBlockWithMeta,
  redoEditorHistory,
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
  return host as unknown as HostOptionalEvents;
}

function clampZoomPercent(value: number): number {
  if (!Number.isFinite(value)) return 100;
  return Math.min(200, Math.max(25, Math.round(value)));
}

export function EditorSiteView(props: EditorSiteViewProps) {
  const { initialDocument: initialDocumentUnknown } = props;
  const pathname = props.pathname;
  const siteId = props.siteId;
  const viewerCtx = props.viewerCtx;

  if (!isCoreDocumentIR(initialDocumentUnknown)) {
    // If we ever loosen the API schema, keep editor mode strict to avoid accepting arbitrary JSON.
    throw new Error("Invalid DocumentIR in editor mode");
  }

  const baseDocument = initialDocumentUnknown as CoreDocumentIR;

  const [history, setHistory] = React.useState(() => createEditorHistory(baseDocument));
  const [hasDraftOverride, setHasDraftOverride] = React.useState(false);
  const [overlayMode, setOverlayMode] = React.useState<EditorOverlayMode>("inspect");
  const [selectedBlockId, setSelectedBlockId] = React.useState<BlockId | null>(null);
  const [hoveredBlockId, setHoveredBlockId] = React.useState<BlockId | null>(null);
  const [canvasState, setCanvasState] = React.useState<EditorCanvasState>(DEFAULT_CANVAS_STATE);

  const hostRef = React.useRef<EditorPortalPenpalConnection["host"] | null>(null);
  const overlayModeRef = React.useRef<EditorOverlayMode>("inspect");
  const pathnameRef = React.useRef<string>(pathname);
  const historyRef = React.useRef(history);
  const selectedBlockIdRef = React.useRef<BlockId | null>(selectedBlockId);
  const canvasStateRef = React.useRef<EditorCanvasState>(canvasState);
  const hoverRafRef = React.useRef<number | null>(null);
  const pendingHoverRef = React.useRef<BlockId | null>(null);

  const renderDocument = history.present;

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
    return () => {
      if (hoverRafRef.current) {
        window.cancelAnimationFrame(hoverRafRef.current);
        hoverRafRef.current = null;
      }
    };
  }, []);

  React.useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  React.useEffect(() => {
    // Route changed -> clear host overrides so we do not accidentally show a draft from another page.
    const nextHistory = createEditorHistory(baseDocument);
    historyRef.current = nextHistory;
    setHistory(nextHistory);
    setHasDraftOverride(false);
    setSelectedBlockId(null);
    setHoveredBlockId(null);
  }, [baseDocument, pathname]);

  const hoveredRect = useObservedBlockRect({
    enabled: overlayMode === "inspect",
    blockId: hoveredBlockId,
    onMissing: () => setHoveredBlockId(null),
  });

  const selectedRect = useObservedBlockRect({
    enabled: overlayMode !== "off",
    blockId: selectedBlockId,
    onMissing: () => setSelectedBlockId(null),
  });

  const syncSelectionInspector = React.useCallback(
    (document: CoreDocumentIR, blockId: BlockId | null) => {
      const inspector = buildSelectionInspector(document, blockId);
      getHostOptionalEvents(hostRef.current).selectionInspectorChanged?.({ inspector });
      return inspector;
    },
    [],
  );

  const syncLayers = React.useCallback((document: CoreDocumentIR) => {
    const layers = buildLayerTree(document);
    getHostOptionalEvents(hostRef.current).layerTreeChanged?.({ layers });
    return layers;
  }, []);

  const syncHistoryState = React.useCallback((nextHistoryState: EditorHistoryState) => {
    getHostOptionalEvents(hostRef.current).historyChanged?.(nextHistoryState);
  }, []);

  const commitNextDocument = React.useCallback(
    (nextDocument: CoreDocumentIR, opts?: { preserveSelection?: boolean }) => {
      const nextHistory = commitEditorHistory(historyRef.current, nextDocument);
      historyRef.current = nextHistory;
      setHistory(nextHistory);
      setHasDraftOverride(true);

      const currentSelected = opts?.preserveSelection ? selectedBlockIdRef.current : null;
      const inspector = buildSelectionInspector(nextDocument, currentSelected);
      if (inspector.blockId !== currentSelected) {
        setSelectedBlockId(inspector.blockId);
      }

      syncHistoryState(toEditorHistoryState(nextHistory));
      syncLayers(nextDocument);
      syncSelectionInspector(nextDocument, inspector.blockId);
      return inspector;
    },
    [syncHistoryState, syncLayers, syncSelectionInspector],
  );

  const undoFromPortal = React.useCallback((): EditorHistoryState => {
    const nextHistory = undoEditorHistory(historyRef.current);
    historyRef.current = nextHistory;
    setHistory(nextHistory);

    const inspector = buildSelectionInspector(nextHistory.present, selectedBlockIdRef.current);
    if (inspector.blockId !== selectedBlockIdRef.current) {
      setSelectedBlockId(inspector.blockId);
    }

    syncLayers(nextHistory.present);
    syncSelectionInspector(nextHistory.present, inspector.blockId);
    const snapshot = toEditorHistoryState(nextHistory);
    syncHistoryState(snapshot);
    return snapshot;
  }, [syncHistoryState, syncLayers, syncSelectionInspector]);

  const redoFromPortal = React.useCallback((): EditorHistoryState => {
    const nextHistory = redoEditorHistory(historyRef.current);
    historyRef.current = nextHistory;
    setHistory(nextHistory);

    const inspector = buildSelectionInspector(nextHistory.present, selectedBlockIdRef.current);
    if (inspector.blockId !== selectedBlockIdRef.current) {
      setSelectedBlockId(inspector.blockId);
    }

    syncLayers(nextHistory.present);
    syncSelectionInspector(nextHistory.present, inspector.blockId);
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

      const isUndo = isMeta && !ev.shiftKey && key === "z";
      if (isUndo) {
        ev.preventDefault();
        ev.stopPropagation();
        undoFromPortal();
        return;
      }

      const isRedo = (isMeta && ev.shiftKey && key === "z") || (ev.ctrlKey && key === "y");
      if (isRedo) {
        ev.preventDefault();
        ev.stopPropagation();
        redoFromPortal();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [overlayMode, pathname, redoFromPortal, siteId, undoFromPortal]);

  React.useEffect(() => {
    let mounted = true;
    let destroy: (() => void) | null = null;

    // This route is intended to run inside an iframe (Admin host shell).
    if (!window.parent || window.parent === window) {
      return () => {};
    }

    // We rely on Penpal built-in origin restriction (`parentOrigin`).
    // Cross-origin hosts must pass `?parentOrigin=...` explicitly.
    // Same-origin embeds can omit it; we default to `window.location.origin`.
    const parentOrigin = getParentOriginFromSearch() ?? window.location.origin;

    const methods: PortalEditorRpcApi = {
      getProtocolVersion: () => 1,
      ping: () => ({ receivedAt: Date.now() }),
      setOverlayMode: ({ mode }) => {
        setOverlayMode(mode);
        if (mode === "off") setSelectedBlockId(null);
        if (mode === "off") setHoveredBlockId(null);
      },
      selectBlock: ({ blockId }) => {
        if (overlayModeRef.current === "off") return;
        setSelectedBlockId(blockId);
      },
      pushDraftDocument: ({ document, pathname: incomingPathname }) => {
        // Optional scope guard: avoid applying drafts for other pathnames.
        if (incomingPathname && incomingPathname !== pathnameRef.current) {
          return;
        }
        if (!isCoreDocumentIR(document)) {
          return;
        }

        const nextHistory = createEditorHistory(document);
        historyRef.current = nextHistory;
        setHistory(nextHistory);
        setHasDraftOverride(true);
        setSelectedBlockId(null);
        setHoveredBlockId(null);
        syncHistoryState(toEditorHistoryState(nextHistory));
        syncLayers(nextHistory.present);
        syncSelectionInspector(nextHistory.present, null);
      },
      undo: () => undoFromPortal(),
      redo: () => redoFromPortal(),
      getHistoryState: () => toEditorHistoryState(historyRef.current),
      getSelectionInspector: () =>
        buildSelectionInspector(historyRef.current.present, selectedBlockIdRef.current),
      applySelectionPatch: ({ patch }) => {
        const patched = applySelectionPatch(
          historyRef.current.present,
          selectedBlockIdRef.current,
          patch,
        );

        if (patched.document !== historyRef.current.present) {
          return commitNextDocument(patched.document, { preserveSelection: true });
        }

        syncSelectionInspector(historyRef.current.present, selectedBlockIdRef.current);
        return patched.inspector;
      },
      getLayerTree: () => buildLayerTree(historyRef.current.present),
      insertBlock: (args) => {
        const inserted = insertBlockWithMeta(historyRef.current.present, {
          ...args,
          targetBlockId: args.targetBlockId ?? selectedBlockIdRef.current,
        });

        const nextHistory = commitEditorHistory(historyRef.current, inserted.document);
        historyRef.current = nextHistory;
        setHistory(nextHistory);
        setHasDraftOverride(true);
        setSelectedBlockId(inserted.blockId);
        syncHistoryState(toEditorHistoryState(nextHistory));
        syncLayers(inserted.document);
        syncSelectionInspector(inserted.document, inserted.blockId);

        return {
          blockId: inserted.blockId,
          inspector: inserted.inspector,
          layers: inserted.layers,
        };
      },
      setDevicePreset: ({ devicePreset }) =>
        updateCanvas((prev) => ({
          ...prev,
          devicePreset,
        })),
      setZoom: ({ zoomPercent }) =>
        updateCanvas((prev) => ({
          ...prev,
          zoomPercent: clampZoomPercent(zoomPercent),
        })),
      resetZoom: () =>
        updateCanvas((prev) => ({
          ...prev,
          zoomPercent: 100,
        })),
      setCanvasPreferences: ({ preferences }) =>
        updateCanvas((prev) => ({
          ...prev,
          preferences: {
            ...prev.preferences,
            ...preferences,
          },
        })),
      getCanvasState: () => canvasStateRef.current,

      // --- Inline editing (skeleton stubs) ---
      startInlineEdit: ({ blockId: _b, fieldKey: _f }) => ({ content: [] }),
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

    // Throttle presence updates to avoid noisy iframe chatter.
    const timer = window.setTimeout(() => {
      void hostRef.current?.reportPresence({ presence });
    }, 100);
    return () => window.clearTimeout(timer);
  }, [canvasState, hasDraftOverride, overlayMode, pathname, selectedBlockId, siteId]);

  React.useEffect(() => {
    if (overlayMode !== "inspect") {
      setHoveredBlockId(null);
    }
  }, [overlayMode]);

  return (
    <div data-portal-mode="editor">
      <div
        onClick={(ev) => {
          if (overlayMode === "off") return;
          const target = ev.target as HTMLElement | null;
          const el = target?.closest?.("[data-block-id]") as HTMLElement | null;
          const blockId = el?.getAttribute("data-block-id") ?? null;
          setSelectedBlockId(blockId);
        }}
        onMouseMove={(ev) => {
          if (overlayMode !== "inspect") return;
          const target = ev.target as HTMLElement | null;
          const el = target?.closest?.("[data-block-id]") as HTMLElement | null;
          const blockId = (el?.getAttribute("data-block-id") ?? null) as BlockId | null;
          pendingHoverRef.current = blockId;
          if (hoverRafRef.current) return;
          hoverRafRef.current = window.requestAnimationFrame(() => {
            hoverRafRef.current = null;
            setHoveredBlockId(pendingHoverRef.current);
          });
        }}
        onMouseLeave={() => {
          pendingHoverRef.current = null;
          if (hoverRafRef.current) {
            window.cancelAnimationFrame(hoverRafRef.current);
            hoverRafRef.current = null;
          }
          setHoveredBlockId(null);
        }}
      >
        <DocumentRenderer document={renderDocument} ctx={viewerCtx} />
      </div>
      <div data-editor-overlay="true">
        {hoveredRect && overlayMode === "inspect" ? (
          <div
            data-editor-overlay="hover"
            style={{
              transform: `translate3d(${hoveredRect.left}px, ${hoveredRect.top}px, 0)`,
              width: `${hoveredRect.width}px`,
              height: `${hoveredRect.height}px`,
            }}
          />
        ) : null}
        {selectedRect ? (
          <div
            data-editor-overlay="selection"
            style={{
              transform: `translate3d(${selectedRect.left}px, ${selectedRect.top}px, 0)`,
              width: `${selectedRect.width}px`,
              height: `${selectedRect.height}px`,
            }}
          >
            <div data-editor-overlay-handle="nw" />
            <div data-editor-overlay-handle="ne" />
            <div data-editor-overlay-handle="sw" />
            <div data-editor-overlay-handle="se" />
            {selectedBlockId ? <div data-editor-overlay-label>{selectedBlockId}</div> : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function getBlockElement(blockId: string): HTMLElement | null {
  if (typeof document === "undefined") return null;
  if (!isSafeEditorBlockId(blockId)) return null;
  return document.querySelector(`[data-block-id="${blockId}"]`);
}

function getParentOriginFromSearch(): string | null {
  const raw = new URLSearchParams(window.location.search).get("parentOrigin");
  if (!raw) return null;
  if (!isHttpOrigin(raw)) return null;
  return raw;
}

type ObservedBlockRect = {
  top: number;
  left: number;
  width: number;
  height: number;
};

// Must match the guard in @celestial/site-renderer-core.
const SAFE_BLOCK_ID_RE = /^[A-Za-z0-9][A-Za-z0-9:_-]*$/;

function isSafeEditorBlockId(value: string): boolean {
  return SAFE_BLOCK_ID_RE.test(value);
}

function useObservedBlockRect(args: {
  enabled: boolean;
  blockId: BlockId | null;
  onMissing: () => void;
}): ObservedBlockRect | null {
  const [rect, setRect] = React.useState<ObservedBlockRect | null>(null);

  const onMissingRef = React.useRef(args.onMissing);
  React.useEffect(() => {
    onMissingRef.current = args.onMissing;
  }, [args.onMissing]);

  React.useEffect(() => {
    if (!args.enabled || !args.blockId) {
      setRect(null);
      return;
    }

    let disposed = false;
    let rafLoop: number | null = null;
    let isIntersecting = true;
    let last: ObservedBlockRect | null = null;

    const readAndSet = () => {
      const el = getBlockElement(args.blockId as string);
      if (!el) {
        setRect(null);
        onMissingRef.current();
        return;
      }
      const r = el.getBoundingClientRect();
      const next: ObservedBlockRect = {
        top: r.top,
        left: r.left,
        width: r.width,
        height: r.height,
      };
      if (
        last &&
        last.top === next.top &&
        last.left === next.left &&
        last.width === next.width &&
        last.height === next.height
      ) {
        return;
      }
      last = next;
      setRect(next);
    };

    const startLoop = () => {
      if (rafLoop) return;
      const tick = () => {
        rafLoop = window.requestAnimationFrame(() => {
          rafLoop = null;
          if (disposed) return;
          if (!isIntersecting) return;
          readAndSet();
          startLoop();
        });
      };
      tick();
    };

    const stopLoop = () => {
      if (!rafLoop) return;
      window.cancelAnimationFrame(rafLoop);
      rafLoop = null;
    };

    const el = getBlockElement(args.blockId);
    if (!el) {
      setRect(null);
      onMissingRef.current();
      return;
    }

    const resizeObserver = new ResizeObserver(() => {
      if (disposed) return;
      readAndSet();
    });
    resizeObserver.observe(el);

    const intersectionObserver = new IntersectionObserver(
      (entries) => {
        if (disposed) return;
        const entry = entries[0];
        if (!entry) return;
        isIntersecting = Boolean(entry.isIntersecting);
        if (!isIntersecting) {
          stopLoop();
          setRect(null);
          return;
        }
        readAndSet();
        startLoop();
      },
      {
        root: null,
        threshold: [0],
      },
    );
    intersectionObserver.observe(el);

    // Initial rect.
    readAndSet();
    startLoop();

    return () => {
      disposed = true;
      stopLoop();
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
    };
  }, [args.blockId, args.enabled]);

  return rect;
}
