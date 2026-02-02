import React from "react";
import { createFileRoute } from "@tanstack/react-router";

import type { EditorOverlayMode } from "@celestial/site-editor-protocol";
import type { EditorPresence, HostEditorRpcApi } from "@celestial/site-editor-protocol";
import type { DocumentIR } from "@celestial/site-block-protocol";
import type { CoreDocumentIR } from "@celestial/site-renderer-core";
import {
  buildEditorIframeHref,
  createEditorHostConnector,
  normalizePathname,
} from "@celestial/site-editor-bridge";
import type {
  EditorHostConnector,
  EditorHostPenpalConnection,
} from "@celestial/site-editor-bridge";

import { getHardcodedDocument } from "@/runtime/hardcoded-document";

export const Route = createFileRoute("/editor-host")({
  component: EditorHostPage,
});

function EditorHostPage() {
  const iframeRef = React.useRef<HTMLIFrameElement | null>(null);
  const [overlayMode, setOverlayMode] = React.useState<EditorOverlayMode>("inspect");
  const overlayModeRef = React.useRef<EditorOverlayMode>("inspect");
  const [selectedBlockId, setSelectedBlockId] = React.useState<string | null>(null);
  const [lastPingRttMs, setLastPingRttMs] = React.useState<number | null>(null);
  const [lastPingError, setLastPingError] = React.useState<string | null>(null);
  const [previewToken, setPreviewToken] = React.useState<string>("demo");
  const previewTokenRef = React.useRef<string>("demo");
  const presenceClientIdRef = React.useRef<string>("");
  const lastPresenceHeartbeatAtRef = React.useRef<number>(0);
  const [pathname, setPathname] = React.useState<string>("/");
  const [lastPresence, setLastPresence] = React.useState<{
    pathname: string;
    overlayMode: EditorOverlayMode;
    selectedBlockId: string | null;
    hasDraftOverride: boolean;
    updatedAtMs: number;
  } | null>(null);
  const [lastSave, setLastSave] = React.useState<{
    pathname: string;
    revision: number;
    savedAtMs: number;
  } | null>(null);
  const [saveStatus, setSaveStatus] = React.useState<"idle" | "saving" | "error">("idle");
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const draftRevisionsRef = React.useRef<Map<string, number>>(new Map());

  const portalRef = React.useRef<EditorHostPenpalConnection["portal"] | null>(null);
  const connectorRef = React.useRef<EditorHostConnector | null>(null);

  const pingSeqRef = React.useRef(0);

  React.useEffect(() => {
    previewTokenRef.current = previewToken;
  }, [previewToken]);

  React.useEffect(() => {
    // Client-only: presence client id should be stable within a browser tab.
    const storageKey = "portal:presenceClientId";
    try {
      const existing = window.sessionStorage.getItem(storageKey);
      if (existing && existing.length >= 6) {
        presenceClientIdRef.current = existing;
        return;
      }
      const raw =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now()}_${Math.random()}`;
      const next = `c_${String(raw).replace(/[^a-zA-Z0-9]/g, "")}`.slice(0, 64);
      window.sessionStorage.setItem(storageKey, next);
      presenceClientIdRef.current = next;
    } catch {
      // Best-effort: if storage is unavailable, keep an in-memory id.
      presenceClientIdRef.current = `c_${String(Date.now())}`.slice(0, 64);
    }
  }, []);

  React.useEffect(() => {
    overlayModeRef.current = overlayMode;
  }, [overlayMode]);

  React.useEffect(() => {
    return () => {
      portalRef.current = null;
      connectorRef.current?.disconnect();
      connectorRef.current = null;
    };
  }, []);

  const sendPing = React.useCallback(async (opts?: { silent?: boolean }) => {
    const portal = portalRef.current;
    if (!portal) return;
    const seq = ++pingSeqRef.current;
    try {
      if (!opts?.silent) setLastPingError(null);
      const sentAt = Date.now();
      await portal.ping({ sentAt });
      // Guard against older concurrent pings overwriting newer results.
      if (seq !== pingSeqRef.current) return;
      setLastPingRttMs(Date.now() - sentAt);
    } catch (err) {
      if (seq !== pingSeqRef.current) return;
      if (opts?.silent) return;
      setLastPingRttMs(null);
      setLastPingError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  const pushDraft = React.useCallback(
    (document: CoreDocumentIR) => {
      void portalRef.current?.pushDraftDocument({
        document,
        pathname: normalizePathname(pathname),
      });
    },
    [pathname],
  );

  const selectBlock = React.useCallback((blockId: string | null) => {
    setSelectedBlockId(blockId);
    void portalRef.current?.selectBlock({ blockId });
  }, []);

  const setChildOverlayMode = React.useCallback((mode: EditorOverlayMode) => {
    setOverlayMode(mode);
    void portalRef.current?.setOverlayMode({ mode });
    if (mode === "off") {
      // Keep host UI consistent with iframe behavior.
      setSelectedBlockId(null);
    }
  }, []);

  const hostMethods = React.useMemo<HostEditorRpcApi>(
    () => ({
      ready: ({ readyAt }) => {
        // eslint-disable-next-line no-console
        console.log("[portal editor host] ready:", { readyAt });
      },
      selectionChanged: ({ blockId }) => {
        setSelectedBlockId(blockId);
      },
      requestSave: ({ siteId, pathname, document }) => {
        void (async () => {
          try {
            setSaveStatus("saving");
            setSaveError(null);
            const token = previewTokenRef.current;
            const expectedRevision = draftRevisionsRef.current.get(pathname) ?? null;
            const payload = await saveRouteDraftToApi({
              siteId,
              pathname,
              token,
              document,
              expectedRevision,
            });
            if (!payload) throw new Error("Invalid save response");
            setLastSave({
              pathname: payload.path,
              revision: payload.revision,
              savedAtMs: payload.savedAtMs,
            });
            draftRevisionsRef.current.set(payload.path, payload.revision);
            setSaveStatus("idle");
          } catch (err) {
            setSaveStatus("error");
            setSaveError(err instanceof Error ? err.message : String(err));
          }
        })();
      },
      reportPresence: ({ presence }) => {
        const p: EditorPresence = presence;
        setLastPresence({
          pathname: p.pathname,
          overlayMode: p.overlayMode,
          selectedBlockId: p.selectedBlockId,
          hasDraftOverride: p.hasDraftOverride,
          updatedAtMs: p.updatedAtMs,
        });

        // Best-effort heartbeat: presence is a collaboration primitive (TTL-based).
        // Keep it low-frequency to avoid noisy network traffic from iframe chatter.
        const token = previewTokenRef.current;
        const clientId = presenceClientIdRef.current;
        if (!token || !clientId) return;
        const now = Date.now();
        if (now - lastPresenceHeartbeatAtRef.current < 5000) return;
        lastPresenceHeartbeatAtRef.current = now;
        void heartbeatPresenceToApi({
          siteId: "00000000-0000-0000-0000-000000000001",
          token,
          docKey: `route:${p.pathname}`,
          clientId,
          actor: { displayName: "Dev Editor" },
        }).catch(() => {
          // Presence is non-critical; errors should not break the editor harness.
        });
      },
    }),
    [],
  );

  React.useEffect(() => {
    let mounted = true;

    void (async () => {
      try {
        const siteId = "00000000-0000-0000-0000-000000000001";
        const res = await fetch(`/api/v1/sites/${siteId}/preview-tokens`, {
          method: "POST",
          headers: { accept: "application/json" },
        });
        if (!res.ok) throw new Error(`Failed to issue preview token (${res.status})`);
        const payload: unknown = await res.json();
        const token = parsePreviewToken(payload);
        if (!token) throw new Error("Invalid preview token response");
        if (!mounted) return;
        setPreviewToken(token);
      } catch {
        // Best-effort: local harness should work even if backend isn't running.
        if (!mounted) return;
        setPreviewToken("demo");
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  React.useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    const connector = createEditorHostConnector({
      iframe,
      childOrigin: window.location.origin,
      methods: hostMethods,
      onConnected: async (portal) => {
        portalRef.current = portal;
        void sendPing({ silent: true });
        await portal.setOverlayMode({ mode: overlayModeRef.current });
      },
    });
    connectorRef.current = connector;

    const onLoad = () => {
      portalRef.current = null;
      void connector.connect({ silent: true });
    };
    iframe.addEventListener("load", onLoad);

    // Initial connect: we don't rely on load events.
    const timer = window.setTimeout(() => {
      portalRef.current = null;
      void connector.connect({ silent: true });
    }, 0);

    return () => {
      iframe.removeEventListener("load", onLoad);
      window.clearTimeout(timer);
      portalRef.current = null;
      connector.disconnect();
      if (connectorRef.current === connector) connectorRef.current = null;
    };
  }, [hostMethods, sendPing]);

  const baseDoc = React.useMemo(() => getHardcodedDocument(), []);
  const draftDoc1 = React.useMemo<CoreDocumentIR>(() => {
    // Minimal mutation: change title and first heading text.
    const next: CoreDocumentIR = {
      ...baseDoc,
      meta: {
        ...baseDoc.meta,
        title: { "zh-CN": "Portal Editor Draft", "en-US": "Portal Editor Draft" },
      },
    };

    next.blocks = baseDoc.blocks.map((b) => {
      if (b.type !== "container") return b;
      if (!b.children) return b;
      return Object.assign({}, b, {
        children: b.children.map((c) => {
          if (c.type !== "heading") return c;
          if (c.id !== "b1-h1") return c;
          return Object.assign({}, c, {
            props: Object.assign({}, c.props, {
              text: {
                "zh-CN": "这是 Draft 标题（来自 Host）",
                "en-US": "Draft heading (from host)",
              },
            }),
          });
        }),
      });
    });

    return next;
  }, [baseDoc]);

  return (
    <div className="portal-editor-host">
      <div className="portal-editor-host-toolbar">
        <span className="portal-editor-host-meta">
          Overlay: <code>{overlayMode}</code>
        </span>
        <span className="portal-editor-host-meta">
          Ping:{" "}
          <code>
            {lastPingRttMs !== null ? `${lastPingRttMs}ms` : lastPingError ? "error" : "n/a"}
          </code>
        </span>
        {lastPingError ? (
          <span className="portal-editor-host-meta">
            Ping error: <code>{lastPingError}</code>
          </span>
        ) : null}
        <button type="button" onClick={() => setChildOverlayMode("off")}>
          Overlay Off
        </button>
        <button type="button" onClick={() => setChildOverlayMode("inspect")}>
          Inspect
        </button>
        <button type="button" onClick={() => setChildOverlayMode("edit")}>
          Edit
        </button>
        <button
          type="button"
          onClick={() => {
            void sendPing();
          }}
        >
          Ping
        </button>
        <span className="portal-editor-host-sep" aria-hidden="true" />
        <button
          type="button"
          onClick={() => {
            pushDraft(baseDoc);
          }}
        >
          Reset Draft
        </button>
        <button
          type="button"
          onClick={() => {
            pushDraft(draftDoc1);
          }}
        >
          Push Draft #1
        </button>
        <button type="button" onClick={() => selectBlock("b1-h1")}>
          Select b1-h1
        </button>
        <button type="button" onClick={() => selectBlock("b1-p1")}>
          Select b1-p1
        </button>
        <button type="button" onClick={() => selectBlock(null)}>
          Clear Selection
        </button>
        <span className="portal-editor-host-meta">
          Selected: <code>{selectedBlockId ?? "null"}</code>
        </span>
        <span className="portal-editor-host-meta">
          Path: <code>{normalizePathname(pathname)}</code>
        </span>
        {lastPresence ? (
          <span className="portal-editor-host-meta">
            Presence: <code>{lastPresence.pathname}</code>{" "}
            <code>{String(lastPresence.overlayMode)}</code>{" "}
            <code>{lastPresence.selectedBlockId ?? "null"}</code>{" "}
            <code>{lastPresence.hasDraftOverride ? "draft" : "base"}</code>
          </span>
        ) : null}
        <span className="portal-editor-host-meta">
          Save:{" "}
          <code>
            {saveStatus === "saving"
              ? "saving"
              : saveStatus === "error"
                ? "error"
                : lastSave
                  ? `rev ${lastSave.revision}`
                  : "n/a"}
          </code>
        </span>
        {saveError ? (
          <span className="portal-editor-host-meta">
            Save error: <code>{saveError}</code>
          </span>
        ) : null}
        <span className="portal-editor-host-sep" aria-hidden="true" />
        <button type="button" onClick={() => setPathname("/")}>
          Go /
        </button>
        <button type="button" onClick={() => setPathname("/about")}>
          Go /about
        </button>
        <button type="button" onClick={() => setPathname("/blog/hello")}>
          Go /blog/hello
        </button>
        <button type="button" onClick={() => setPathname("/old-about")}>
          Go /old-about
        </button>
      </div>
      <iframe
        ref={iframeRef}
        title="portal-editor-host"
        src={buildEditorIframeHref({ siteId: "demo", pathname, token: previewToken })}
        className="portal-editor-host-iframe"
      />
    </div>
  );
}

function parsePreviewToken(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const data = (payload as { data?: unknown }).data;
  if (!data || typeof data !== "object") return null;
  const token = (data as { token?: unknown }).token;
  if (typeof token !== "string") return null;
  const trimmed = token.trim();
  return trimmed ? trimmed : null;
}

async function saveRouteDraftToApi(args: {
  siteId: string;
  pathname: string;
  token: string;
  document: DocumentIR;
  expectedRevision: number | null;
}): Promise<{ path: string; revision: number; savedAtMs: number } | null> {
  const url = `/api/v1/sites/${encodeURIComponent(args.siteId)}/routes/draft?token=${encodeURIComponent(
    args.token,
  )}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify({
      path: args.pathname,
      document: args.document,
      ...(args.expectedRevision ? { expectedRevision: args.expectedRevision } : {}),
    }),
  });
  if (!res.ok) {
    const maybe = await res.json().catch(() => null);
    if (res.status === 409) {
      const details = parseConflictMeta(maybe);
      throw new Error(
        details
          ? `Draft conflict: expected ${details.expectedRevision}, current ${details.currentRevision}`
          : "Draft conflict (409)",
      );
    }
    throw new Error(`Save failed (${res.status})`);
  }
  const payload: unknown = await res.json();
  return parseDraftSaveOut(payload);
}

async function heartbeatPresenceToApi(args: {
  siteId: string;
  token: string;
  docKey: string;
  clientId: string;
  actor: Record<string, string> | null;
}): Promise<number | null> {
  const url = `/api/v1/sites/${encodeURIComponent(args.siteId)}/presence/heartbeat?token=${encodeURIComponent(
    args.token,
  )}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify({
      docKey: args.docKey,
      clientId: args.clientId,
      actor: args.actor,
    }),
  });
  if (!res.ok) return null;
  const payload: unknown = await res.json().catch(() => null);
  if (!payload || typeof payload !== "object") return null;
  const data = (payload as { data?: unknown }).data;
  if (!data || typeof data !== "object") return null;
  const expiresAtMs = (data as { expiresAtMs?: unknown }).expiresAtMs;
  return typeof expiresAtMs === "number" && Number.isFinite(expiresAtMs) ? expiresAtMs : null;
}

function parseDraftSaveOut(
  payload: unknown,
): { path: string; revision: number; savedAtMs: number } | null {
  if (!payload || typeof payload !== "object") return null;
  const data = (payload as { data?: unknown }).data;
  if (!data || typeof data !== "object") return null;
  const rec = data as Record<string, unknown>;
  const path = rec.path;
  const revision = rec.revision;
  const savedAtMs = rec.savedAtMs ?? rec.saved_at_ms;
  if (typeof path !== "string" || !path.startsWith("/")) return null;
  if (typeof revision !== "number" || !Number.isFinite(revision)) return null;
  if (typeof savedAtMs !== "number" || !Number.isFinite(savedAtMs)) return null;
  return { path, revision, savedAtMs };
}

function parseConflictMeta(
  payload: unknown,
): { expectedRevision: number; currentRevision: number } | null {
  if (!payload || typeof payload !== "object") return null;
  const meta = (payload as { meta?: unknown }).meta;
  if (!meta || typeof meta !== "object") return null;
  const rec = meta as Record<string, unknown>;
  const expectedRevision = rec.expectedRevision;
  const currentRevision = rec.currentRevision;
  if (typeof expectedRevision !== "number" || typeof currentRevision !== "number") return null;
  if (!Number.isFinite(expectedRevision) || !Number.isFinite(currentRevision)) return null;
  return { expectedRevision, currentRevision };
}
