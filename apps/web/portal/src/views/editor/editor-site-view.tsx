import React from "react";
import { DocumentRenderer } from "@celestial/site-renderer-core";
import type { CoreDocumentIR } from "@celestial/site-renderer-core";
import { isCoreDocumentIR } from "@celestial/site-renderer-core";

import type { ViewerContext } from "@celestial/site-block-protocol";
import { CORE_BLOCK_MANIFESTS, CORE_BLOCK_PATTERNS } from "@celestial/site-block-protocol";
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
  deleteBlock as deleteBlockInDocument,
  insertBlockWithMeta,
  insertBlockTreeWithMeta,
  moveBlock as moveBlockInDocument,
  redoEditorHistory,
  toEditorHistoryState,
  duplicateBlockWithMeta,
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
  const [draftDocument, setDraftDocument] = React.useState<CoreDocumentIR | null>(null);

  type InlineEditState = {
    blockId: BlockId;
    blockType: "heading" | "paragraph";
    initialText: string;
    draftText: string;
  };
  const [inlineEdit, setInlineEdit] = React.useState<InlineEditState | null>(null);

  const hostRef = React.useRef<EditorPortalPenpalConnection["host"] | null>(null);
  const overlayModeRef = React.useRef<EditorOverlayMode>("inspect");
  const pathnameRef = React.useRef<string>(pathname);
  const historyRef = React.useRef(history);
  const selectedBlockIdRef = React.useRef<BlockId | null>(selectedBlockId);
  const canvasStateRef = React.useRef<EditorCanvasState>(canvasState);
  const draftDocumentRef = React.useRef<CoreDocumentIR | null>(draftDocument);
  const inlineEditRef = React.useRef<InlineEditState | null>(inlineEdit);
  const hoverRafRef = React.useRef<number | null>(null);
  const pendingHoverRef = React.useRef<BlockId | null>(null);

  const renderDocument = draftDocument ?? history.present;

  type ResizeSession = {
    pointerId: number;
    blockId: BlockId;
    startClientX: number;
    startClientY: number;
    startWidth: number;
    startHeight: number;
    baseDocument: CoreDocumentIR;
  };
  const resizeSessionRef = React.useRef<ResizeSession | null>(null);

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
    draftDocumentRef.current = draftDocument;
  }, [draftDocument]);

  React.useEffect(() => {
    inlineEditRef.current = inlineEdit;
  }, [inlineEdit]);

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
    setDraftDocument(null);
    setInlineEdit(null);
    resizeSessionRef.current = null;
  }, [baseDocument, pathname]);

  React.useEffect(() => {
    if (overlayMode !== "edit") {
      setInlineEdit(null);
      resizeSessionRef.current = null;
      setDraftDocument(null);
      return;
    }

    if (inlineEdit && selectedBlockId && inlineEdit.blockId !== selectedBlockId) {
      setInlineEdit(null);
    }
  }, [inlineEdit, overlayMode, selectedBlockId]);

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

  const commitInlineTextEdit = React.useCallback(
    (args: { document: CoreDocumentIR; blockId: BlockId; locale: string; nextText: string }) => {
      const found = findBlockById(args.document, args.blockId);
      if (!found) return;
      if (found.type !== "heading" && found.type !== "paragraph") return;

      const currentTextValue = (found.props as { text?: unknown }).text;
      const nextTextMap = mergeLocalizedText(currentTextValue, args.locale, args.nextText);

      // 避免在当前语言内容不变时写入新的历史记录。
      if (isRecord(currentTextValue)) {
        const currentLocaleValue = currentTextValue[args.locale];
        if (typeof currentLocaleValue === "string" && currentLocaleValue === args.nextText) {
          return;
        }
      }

      const patched = applySelectionPatch(args.document, args.blockId, {
        section: "component",
        values: { text: nextTextMap },
      });
      if (patched.document === args.document) return;

      commitNextDocument(patched.document, { preserveSelection: true });
    },
    [commitNextDocument],
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

      // When the user is typing inside an input/textarea, keep undo/redo local to the input.
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
      getDocument: () => historyRef.current.present,
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
        setDraftDocument(null);
        draftDocumentRef.current = null;
        setInlineEdit(null);
        inlineEditRef.current = null;
        resizeSessionRef.current = null;
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
      insertBlockTree: (args) => {
        const inserted = insertBlockTreeWithMeta(historyRef.current.present, {
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

      // --- Block registry & patterns ---
      getAvailableBlocks: () => CORE_BLOCK_MANIFESTS,
      getBlockPatterns: ({ category }) =>
        category ? CORE_BLOCK_PATTERNS.filter((p) => p.category === category) : CORE_BLOCK_PATTERNS,

      // --- Block manipulation ---
      moveBlock: ({ blockId, targetId, position }) => {
        const moved = moveBlockInDocument(historyRef.current.present, {
          blockId,
          targetId,
          position,
        });

        if (!moved.moved || moved.document === historyRef.current.present) {
          return buildLayerTree(historyRef.current.present);
        }

        const nextHistory = commitEditorHistory(historyRef.current, moved.document);
        historyRef.current = nextHistory;
        setHistory(nextHistory);
        setHasDraftOverride(true);

        // Keep the moved block selected for predictable UX.
        setSelectedBlockId(blockId);
        syncHistoryState(toEditorHistoryState(nextHistory));
        const layers = syncLayers(moved.document);
        syncSelectionInspector(moved.document, blockId);
        return layers;
      },
      deleteBlock: ({ blockId }) => {
        const deleted = deleteBlockInDocument(historyRef.current.present, { blockId });
        if (!deleted.deleted || deleted.document === historyRef.current.present) {
          return buildLayerTree(historyRef.current.present);
        }

        const nextHistory = commitEditorHistory(historyRef.current, deleted.document);
        historyRef.current = nextHistory;
        setHistory(nextHistory);
        setHasDraftOverride(true);

        const inspector = buildSelectionInspector(deleted.document, selectedBlockIdRef.current);
        setSelectedBlockId(inspector.blockId);
        syncHistoryState(toEditorHistoryState(nextHistory));
        const layers = syncLayers(deleted.document);
        syncSelectionInspector(deleted.document, inspector.blockId);
        return layers;
      },
      duplicateBlock: ({ blockId }) => {
        const duplicated = duplicateBlockWithMeta(historyRef.current.present, { blockId });

        const nextHistory = commitEditorHistory(historyRef.current, duplicated.document);
        historyRef.current = nextHistory;
        setHistory(nextHistory);
        setHasDraftOverride(true);
        setSelectedBlockId(duplicated.blockId);
        syncHistoryState(toEditorHistoryState(nextHistory));
        syncLayers(duplicated.document);
        syncSelectionInspector(duplicated.document, duplicated.blockId);

        return {
          blockId: duplicated.blockId,
          inspector: duplicated.inspector,
          layers: duplicated.layers,
        };
      },

      // --- Responsive (skeleton stub) ---
      setBreakpointOverride: () =>
        buildSelectionInspector(historyRef.current.present, selectedBlockIdRef.current),

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
        onDoubleClick={(ev) => {
          if (overlayMode !== "edit") return;
          if (resizeSessionRef.current) return;
          if (inlineEditRef.current) return;

          const target = ev.target as HTMLElement | null;
          const el = target?.closest?.("[data-block-id]") as HTMLElement | null;
          const blockId = (el?.getAttribute("data-block-id") ?? null) as BlockId | null;
          if (!blockId) return;

          const found = findBlockById(historyRef.current.present, blockId);
          if (!found) return;
          if (found.type !== "heading" && found.type !== "paragraph") return;

          const textValue = (found.props as { text?: unknown }).text;
          const initialText = resolveLocalizedText(
            textValue,
            viewerCtx.locale,
            viewerCtx.fallbackLocale,
          );

          setSelectedBlockId(blockId);
          setInlineEdit({
            blockId,
            blockType: found.type,
            initialText,
            draftText: initialText,
          });
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
        {inlineEdit && selectedRect && selectedBlockId === inlineEdit.blockId ? (
          <textarea
            data-editor-inline-input="true"
            value={inlineEdit.draftText}
            autoFocus
            style={{
              transform: `translate3d(${selectedRect.left}px, ${selectedRect.top}px, 0)`,
              width: `${Math.max(16, selectedRect.width)}px`,
              height: `${Math.max(24, selectedRect.height)}px`,
            }}
            onChange={(ev) => {
              const next = ev.target.value;
              setInlineEdit((prev) => (prev ? { ...prev, draftText: next } : prev));
            }}
            onKeyDown={(ev) => {
              if (ev.key === "Escape") {
                ev.preventDefault();
                ev.stopPropagation();
                inlineEditRef.current = null;
                setInlineEdit(null);
                return;
              }

              if (ev.key !== "Enter") return;

              const shouldCommit = inlineEdit.blockType === "heading" || ev.metaKey || ev.ctrlKey;
              if (!shouldCommit) return;

              ev.preventDefault();
              ev.stopPropagation();

              commitInlineTextEdit({
                document: historyRef.current.present,
                blockId: inlineEdit.blockId,
                locale: viewerCtx.locale,
                nextText: inlineEdit.draftText,
              });
              inlineEditRef.current = null;
              setInlineEdit(null);
            }}
            onBlur={() => {
              const current = inlineEditRef.current;
              if (!current) return;
              commitInlineTextEdit({
                document: historyRef.current.present,
                blockId: current.blockId,
                locale: viewerCtx.locale,
                nextText: current.draftText,
              });
              inlineEditRef.current = null;
              setInlineEdit(null);
            }}
          />
        ) : null}
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
            {overlayMode === "edit" && selectedBlockId ? (
              <div
                data-editor-overlay-handle="se"
                onPointerDown={(ev) => {
                  if (!selectedRect) return;
                  if (overlayMode !== "edit") return;
                  if (!selectedBlockId) return;
                  if (inlineEditRef.current) return;

                  ev.preventDefault();
                  ev.stopPropagation();

                  const target = ev.currentTarget;
                  target.setPointerCapture(ev.pointerId);

                  resizeSessionRef.current = {
                    pointerId: ev.pointerId,
                    blockId: selectedBlockId,
                    startClientX: ev.clientX,
                    startClientY: ev.clientY,
                    startWidth: selectedRect.width,
                    startHeight: selectedRect.height,
                    baseDocument: historyRef.current.present,
                  };

                  document.body.style.userSelect = "none";
                }}
                onPointerMove={(ev) => {
                  const session = resizeSessionRef.current;
                  if (!session) return;
                  if (ev.pointerId !== session.pointerId) return;

                  ev.preventDefault();
                  ev.stopPropagation();

                  const dx = ev.clientX - session.startClientX;
                  const dy = ev.clientY - session.startClientY;

                  const nextWidth = Math.max(40, Math.round(session.startWidth + dx));
                  const nextHeight = Math.max(16, Math.round(session.startHeight + dy));

                  const patched = applySelectionPatch(session.baseDocument, session.blockId, {
                    section: "layout",
                    values: { width: nextWidth, height: nextHeight },
                  });

                  draftDocumentRef.current = patched.document;
                  setDraftDocument(patched.document);
                }}
                onPointerCancel={() => {
                  if (!resizeSessionRef.current) return;
                  resizeSessionRef.current = null;
                  document.body.style.userSelect = "";
                  draftDocumentRef.current = null;
                  setDraftDocument(null);
                }}
                onPointerUp={(ev) => {
                  const session = resizeSessionRef.current;
                  if (!session) return;
                  if (ev.pointerId !== session.pointerId) return;

                  resizeSessionRef.current = null;
                  document.body.style.userSelect = "";

                  const nextDocument = draftDocumentRef.current;
                  draftDocumentRef.current = null;
                  setDraftDocument(null);
                  if (!nextDocument || nextDocument === historyRef.current.present) return;
                  commitNextDocument(nextDocument, { preserveSelection: true });
                }}
              />
            ) : null}
            {selectedBlockId ? <div data-editor-overlay-label>{selectedBlockId}</div> : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

type CoreNode = CoreDocumentIR["blocks"][number];

type ParentNode = Extract<CoreNode, { type: "container" | "grid" }>;

function isParentNode(node: CoreNode): node is ParentNode {
  return node.type === "container" || node.type === "grid";
}

function findBlockById(document: CoreDocumentIR, blockId: BlockId): CoreNode | null {
  const walk = (nodes: CoreNode[]): CoreNode | null => {
    for (const node of nodes) {
      if (node.id === blockId) return node;
      if (isParentNode(node) && Array.isArray(node.children)) {
        const found = walk(node.children);
        if (found) return found;
      }
    }
    return null;
  };

  return walk(document.blocks);
}

function resolveLocalizedText(
  value: unknown,
  locale: string,
  fallbackLocale: string | undefined,
): string {
  if (!isRecord(value)) return "";

  const direct = value[locale];
  if (typeof direct === "string") return direct;

  if (fallbackLocale) {
    const fallback = value[fallbackLocale];
    if (typeof fallback === "string") return fallback;
  }

  const en = value["en-US"];
  if (typeof en === "string") return en;

  const zh = value["zh-CN"];
  if (typeof zh === "string") return zh;

  for (const v of Object.values(value)) {
    if (typeof v === "string") return v;
  }

  return "";
}

function mergeLocalizedText(
  value: unknown,
  locale: string,
  nextText: string,
): Record<string, string> {
  const base: Record<string, string> = {};
  if (isRecord(value)) {
    for (const [key, item] of Object.entries(value)) {
      if (typeof item === "string") base[key] = item;
    }
  }

  base[locale] = nextText;
  return base;
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
