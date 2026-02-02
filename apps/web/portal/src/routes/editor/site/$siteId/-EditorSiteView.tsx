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
  const [selectedRect, setSelectedRect] = React.useState<{
    top: number;
    left: number;
    width: number;
    height: number;
  } | null>(null);
  const [hoveredRect, setHoveredRect] = React.useState<{
    top: number;
    left: number;
    width: number;
    height: number;
  } | null>(null);

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

  React.useEffect(() => {
    if (overlayMode !== "inspect" || !hoveredBlockId) {
      setHoveredRect(null);
      return;
    }

    let raf = 0;
    const update = () => {
      raf = window.requestAnimationFrame(() => {
        const el = getBlockElement(hoveredBlockId);
        if (!el) {
          setHoveredRect(null);
          setHoveredBlockId(null);
          return;
        }
        const rect = el.getBoundingClientRect();
        setHoveredRect({
          top: rect.top,
          left: rect.left,
          width: rect.width,
          height: rect.height,
        });
      });
    };

    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
      window.cancelAnimationFrame(raf);
    };
  }, [overlayMode, hoveredBlockId, renderDocument]);

  React.useEffect(() => {
    if (overlayMode === "off" || !selectedBlockId) {
      setSelectedRect(null);
      return;
    }

    let raf = 0;

    const update = () => {
      // Wait for layout to settle (after document / draft updates).
      raf = window.requestAnimationFrame(() => {
        const el = getBlockElement(selectedBlockId);
        if (!el) {
          setSelectedRect(null);
          setSelectedBlockId(null);
          return;
        }
        const rect = el.getBoundingClientRect();
        setSelectedRect({
          top: rect.top,
          left: rect.left,
          width: rect.width,
          height: rect.height,
        });
      });
    };

    update();

    // Update on scroll/resize since the overlay is viewport-fixed.
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);

    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
      window.cancelAnimationFrame(raf);
    };
  }, [overlayMode, selectedBlockId, renderDocument]);

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

  // Prefer standard CSS.escape when available.
  const esc =
    typeof CSS !== "undefined" && typeof CSS.escape === "function"
      ? CSS.escape.bind(CSS)
      : (value: string) => value.replaceAll('"', '\\"');

  return document.querySelector(`[data-block-id="${esc(blockId)}"]`);
}

function getParentOriginFromSearch(): string | null {
  const raw = new URLSearchParams(window.location.search).get("parentOrigin");
  if (!raw) return null;
  if (!isHttpOrigin(raw)) return null;
  return raw;
}
