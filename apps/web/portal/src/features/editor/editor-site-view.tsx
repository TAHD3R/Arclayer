import React from "react";
import { DocumentRenderer } from "@celestial/site-renderer-core";
import type { CoreDocumentIR } from "@celestial/site-renderer-core";
import { isCoreDocumentIR } from "@celestial/site-renderer-core";

import type { ViewerContext } from "@celestial/site-block-protocol";
import type {
  BlockId,
  EditorOverlayMode,
  PortalEditorRpcApi,
} from "@celestial/site-editor-protocol";
import type { EditorPortalPenpalConnection } from "@celestial/site-editor-bridge";
import { connectEditorPortalToHost, isHttpOrigin } from "@celestial/site-editor-bridge";

export interface EditorSiteViewProps {
  initialDocument: unknown;
  viewerCtx: ViewerContext;
  pathname: string;
  siteId: string;
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

  // Sprint 2: keep a strict separation between:
  // - baseDocument: resolved from API for the current route
  // - draftOverride: pushed from the host shell (Admin) for instant preview
  const [draftOverride, setDraftOverride] = React.useState<CoreDocumentIR | null>(null);
  const [overlayMode, setOverlayMode] = React.useState<EditorOverlayMode>("inspect");
  const [selectedBlockId, setSelectedBlockId] = React.useState<BlockId | null>(null);
  const [hoveredBlockId, setHoveredBlockId] = React.useState<BlockId | null>(null);
  const hostRef = React.useRef<EditorPortalPenpalConnection["host"] | null>(null);
  const overlayModeRef = React.useRef<EditorOverlayMode>("inspect");
  const pathnameRef = React.useRef<string>(pathname);
  const hoverRafRef = React.useRef<number | null>(null);
  const pendingHoverRef = React.useRef<BlockId | null>(null);

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
    // Route changed -> clear host overrides so we don't accidentally show a draft from another page.
    setDraftOverride(null);
    setSelectedBlockId(null);
    setHoveredBlockId(null);
  }, [pathname]);

  const renderDocument = draftOverride ?? baseDocument;

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

  React.useEffect(() => {
    if (overlayMode === "off") return;

    const onKeyDown = (ev: KeyboardEvent) => {
      const isSave = (ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === "s";
      if (!isSave) return;
      ev.preventDefault();
      ev.stopPropagation();

      void hostRef.current?.requestSave({
        siteId,
        pathname,
        document: renderDocument,
      });
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [overlayMode, pathname, renderDocument, siteId]);

  React.useEffect(() => {
    let mounted = true;
    let destroy: (() => void) | null = null;

    // This route is intended to run inside an iframe (Admin host shell).
    if (!window.parent || window.parent === window) {
      return () => {};
    }

    // We rely on Penpal's built-in origin restriction (`parentOrigin`).
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
        // Host shells may pass `pathname` to prevent accidental cross-route overwrites.
        // We keep it strict: if pathname is provided and doesn't match, ignore.
        // (Normalize trailing slash at the resolver layer.)
        if (incomingPathname && incomingPathname !== pathnameRef.current) {
          return;
        }
        if (isCoreDocumentIR(document)) {
          setDraftOverride(document);
        }
      },
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
    })();

    return () => {
      mounted = false;
      hostRef.current = null;
      destroy?.();
    };
  }, []);

  React.useEffect(() => {
    void hostRef.current?.selectionChanged({ blockId: selectedBlockId });
  }, [selectedBlockId]);

  React.useEffect(() => {
    const presence = {
      siteId,
      pathname,
      overlayMode,
      selectedBlockId,
      hasDraftOverride: Boolean(draftOverride),
      updatedAtMs: Date.now(),
    };
    // Throttle presence updates to avoid noisy iframe chatter.
    const timer = window.setTimeout(() => {
      void hostRef.current?.reportPresence({ presence });
    }, 100);
    return () => window.clearTimeout(timer);
  }, [draftOverride, overlayMode, pathname, selectedBlockId, siteId]);

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

// Must match the guard in @celestial/site-renderer-core (Sprint 2 security hardening).
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
