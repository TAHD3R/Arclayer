import React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { DocumentRenderer } from "@celestial/site-renderer-core";
import type { CoreDocumentIR } from "@celestial/site-renderer-core";
import { isCoreDocumentIR } from "@celestial/site-renderer-core";

import { getHardcodedDocument } from "@/runtime/hardcoded-document";
import { createEditorPostMessageBridge, isHttpOrigin } from "@celestial/site-editor-bridge";
import type { BlockId } from "@celestial/site-editor-protocol";
import type { EditorOverlayMode } from "@celestial/site-editor-protocol";

export const Route = createFileRoute("/editor/site/$siteId")({
  loader: () => {
    return { document: getHardcodedDocument() };
  },
  component: EditorSitePage,
});

function EditorSitePage() {
  const { document: initialDocument } = Route.useLoaderData();
  const { viewerCtx } = Route.useRouteContext();

  const [draftDocument, setDraftDocument] = React.useState<CoreDocumentIR>(initialDocument);
  const [overlayMode, setOverlayMode] = React.useState<EditorOverlayMode>("inspect");
  const [selectedBlockId, setSelectedBlockId] = React.useState<BlockId | null>(null);
  const bridgeRef = React.useRef<ReturnType<typeof createEditorPostMessageBridge> | null>(null);
  const overlayModeRef = React.useRef<EditorOverlayMode>("inspect");

  React.useEffect(() => {
    overlayModeRef.current = overlayMode;
  }, [overlayMode]);

  React.useEffect(() => {
    const expectedOrigin = getParentOriginFromSearch() ?? window.location.origin;

    const bridge = createEditorPostMessageBridge({
      expectedOrigin,
      targetOrigin: expectedOrigin,
      getTargetWindow: () => {
        if (typeof window === "undefined") return null;
        if (!window.parent || window.parent === window) return null;
        return window.parent;
      },
    });
    bridgeRef.current = bridge;
    bridge.post({ version: 1, type: "READY", payload: { readyAt: Date.now() } });
    const unsubscribe = bridge.onMessage((msg, helpers) => {
      if (msg.type === "PING") {
        const pongBase = {
          version: 1 as const,
          type: "PONG" as const,
          payload: { receivedAt: Date.now() },
        };
        // With exactOptionalPropertyTypes enabled, omit `requestId` instead of setting it to `undefined`.
        const pong = msg.requestId ? { ...pongBase, requestId: msg.requestId } : pongBase;
        helpers.reply(pong);
      }
      if (msg.type === "SET_OVERLAY_MODE") {
        setOverlayMode(msg.payload.mode);
        if (msg.payload.mode === "off") {
          setSelectedBlockId(null);
        }
      }
      if (msg.type === "SELECT_BLOCK") {
        if (overlayModeRef.current === "off") return;
        setSelectedBlockId(msg.payload.blockId);
      }
      if (msg.type === "PUSH_DRAFT_DOCUMENT") {
        const next = msg.payload.document;
        if (isCoreDocumentIR(next)) {
          // Sprint 2/3: enforce schema validation + block registry.
          setDraftDocument(next);
        }
      }
    });

    return () => {
      bridgeRef.current = null;
      unsubscribe();
    };
  }, []);

  React.useEffect(() => {
    bridgeRef.current?.post({
      version: 1,
      type: "SELECTION_CHANGED",
      payload: { blockId: selectedBlockId },
    });
  }, [selectedBlockId]);

  const selectedStyleText =
    overlayMode !== "off" && selectedBlockId
      ? `[data-portal-mode="editor"] [data-block-id="${escapeCssAttr(selectedBlockId)}"]{outline:2px solid var(--color-primary, #1677ff);outline-offset:2px;border-radius:6px;}`
      : "";

  return (
    <div data-portal-mode="editor">
      {selectedStyleText ? <style>{selectedStyleText}</style> : null}
      <div
        onClick={(ev) => {
          if (overlayMode === "off") return;
          const target = ev.target as HTMLElement | null;
          const el = target?.closest?.("[data-block-id]") as HTMLElement | null;
          const blockId = el?.getAttribute("data-block-id") ?? null;
          setSelectedBlockId(blockId);
        }}
      >
        <DocumentRenderer document={draftDocument} ctx={viewerCtx} />
      </div>
      {/* Sprint 2: overlay/selection UI lives here (no visible UI yet). */}
      <div data-editor-overlay="true" />
    </div>
  );
}

function escapeCssAttr(value: string): string {
  // Minimal escaping for CSS attribute selector usage inside a <style> tag.
  // We keep it small because block IDs are controlled by our system.
  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"').replaceAll("</style", "<\\/style");
}

function getParentOriginFromSearch(): string | null {
  // Sprint 2: Admin and Portal can be cross-origin in local dev.
  // The host passes its origin explicitly via query string: `?parentOrigin=...`.
  // This makes the allowlist deterministic and avoids guessing via document.referrer.
  if (typeof window === "undefined") return null;
  const raw = new URLSearchParams(window.location.search).get("parentOrigin");
  if (!raw) return null;
  if (!isHttpOrigin(raw)) return null;
  return raw;
}
