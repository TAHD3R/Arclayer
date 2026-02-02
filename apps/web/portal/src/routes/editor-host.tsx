import React from "react";
import { createFileRoute } from "@tanstack/react-router";

import type { EditorOverlayMode } from "@celestial/site-editor-protocol";
import type { DocumentIR } from "@celestial/site-block-protocol";
import type { CoreDocumentIR } from "@celestial/site-renderer-core";
import { connectEditorHostToPortal } from "@celestial/site-editor-bridge";

import { getHardcodedDocument } from "@/runtime/hardcoded-document";

export const Route = createFileRoute("/editor-host")({
  component: EditorHostPage,
});

function EditorHostPage() {
  const iframeRef = React.useRef<HTMLIFrameElement | null>(null);
  const [overlayMode, setOverlayMode] = React.useState<EditorOverlayMode>("inspect");
  const [selectedBlockId, setSelectedBlockId] = React.useState<string | null>(null);
  const [lastPingRttMs, setLastPingRttMs] = React.useState<number | null>(null);
  const [lastPingError, setLastPingError] = React.useState<string | null>(null);
  const [previewToken, setPreviewToken] = React.useState<string>("demo");
  const previewTokenRef = React.useRef<string>("demo");
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

  const portalRef = React.useRef<
    Awaited<ReturnType<typeof connectEditorHostToPortal>>["portal"] | null
  >(null);
  const destroyRef = React.useRef<(() => void) | null>(null);

  const pingSeqRef = React.useRef(0);

  React.useEffect(() => {
    previewTokenRef.current = previewToken;
  }, [previewToken]);

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

  React.useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    let mounted = true;
    void (async () => {
      const conn = await connectEditorHostToPortal({
        iframe,
        childOrigin: window.location.origin,
        methods: {
          ready: ({ readyAt }) => {
            // eslint-disable-next-line no-console
            console.log("[portal editor host] ready:", { readyAt });
            // We also ping/apply overlay after the portal proxy is available.
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
            setLastPresence({
              pathname: presence.pathname,
              overlayMode: presence.overlayMode,
              selectedBlockId: presence.selectedBlockId,
              hasDraftOverride: presence.hasDraftOverride,
              updatedAtMs: presence.updatedAtMs,
            });
          },
        },
      });

      if (!mounted) {
        conn.destroy();
        return;
      }
      const version = await conn.portal.getProtocolVersion();
      if (version !== 1) {
        // eslint-disable-next-line no-console
        console.error("[portal editor host] Unsupported protocol version:", version);
        conn.destroy();
        return;
      }
      portalRef.current = conn.portal;
      destroyRef.current = conn.destroy;

      // Make the initial handshake deterministic even if READY races with the proxy setup.
      void sendPing({ silent: true });
      void conn.portal.setOverlayMode({ mode: overlayMode });
    })();

    return () => {
      mounted = false;
      portalRef.current = null;
      destroyRef.current?.();
      destroyRef.current = null;
    };
  }, [overlayMode, sendPing]);

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

    const onLoad = () => {
      // Best-effort ping: do not show timeout error if we race with READY/listeners during initial load.
      void sendPing({ silent: true });
    };

    // Ensure the iframe is loaded before sending.
    iframe.addEventListener("load", onLoad);

    // If the iframe is already loaded (or loads before the listener is attached), send a ping anyway.
    // This is only for the local test harness and doesn't affect production editor mode behavior.
    const timer = window.setTimeout(() => {
      void sendPing({ silent: true });
    }, 0);

    return () => {
      iframe.removeEventListener("load", onLoad);
      window.clearTimeout(timer);
    };
  }, [sendPing]);

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
      return {
        ...b,
        children: b.children.map((c) => {
          if (c.type !== "heading") return c;
          if (c.id !== "b1-h1") return c;
          return {
            ...c,
            props: {
              ...c.props,
              text: {
                "zh-CN": "这是 Draft 标题（来自 Host）",
                "en-US": "Draft heading (from host)",
              },
            },
          };
        }),
      };
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
        src={toEditorHref({ siteId: "demo", pathname, token: previewToken })}
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

function normalizePathname(pathnameRaw: string): string {
  const pathname = pathnameRaw.startsWith("/") ? pathnameRaw : `/${pathnameRaw}`;
  if (pathname === "/") return "/";
  return pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
}

function toEditorHref(args: { siteId: string; pathname: string; token: string }): string {
  const pathname = normalizePathname(args.pathname);
  const base = `/__editor/site/${encodeURIComponent(args.siteId)}`;
  const pathPart = pathname === "/" ? "" : pathname;
  const url = new URL(base + pathPart, "http://localhost");
  url.searchParams.set("token", args.token);
  return url.pathname + url.search;
}
