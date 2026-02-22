import React from "react";

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
import { getPortalApiPrefix, getPortalSiteIdFromEnv, resolveRouteFromApi } from "@/runtime/site-api";
import {
  heartbeatPresenceToApi,
  parsePreviewToken,
  publishEntryToApi,
  saveEntryDraftToApi,
  savePageDraftToApi,
  saveRouteDraftToApi,
} from "./editor-host-api";
import { EditorHostToolbar } from "./editor-host-toolbar";

function EditorHostPage() {
  const iframeRef = React.useRef<HTMLIFrameElement | null>(null);
  const siteId = React.useMemo(() => getPortalSiteIdFromEnv(), []);
  const [overlayMode, setOverlayMode] = React.useState<EditorOverlayMode>("inspect");
  const overlayModeRef = React.useRef<EditorOverlayMode>("inspect");
  const [selectedBlockId, setSelectedBlockId] = React.useState<string | null>(null);
  const [lastPingRttMs, setLastPingRttMs] = React.useState<number | null>(null);
  const [lastPingError, setLastPingError] = React.useState<string | null>(null);
  const [previewToken, setPreviewToken] = React.useState<string>("");
  const previewTokenRef = React.useRef<string>("");
  const [previewTokenError, setPreviewTokenError] = React.useState<string | null>(null);
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
  const draftPageIdsRef = React.useRef<Map<string, string>>(new Map());
  const [routeResolveError, setRouteResolveError] = React.useState<string | null>(null);

  const [entrySaveStatus, setEntrySaveStatus] = React.useState<"idle" | "saving" | "error">("idle");
  const [entrySaveError, setEntrySaveError] = React.useState<string | null>(null);
  const [lastEntrySave, setLastEntrySave] = React.useState<{
    slug: string;
    entryId: string;
    revision: number;
    savedAtMs: number;
  } | null>(null);
  const entryDraftRevisionsRef = React.useRef<Map<string, number>>(new Map());

  const portalRef = React.useRef<EditorHostPenpalConnection["portal"] | null>(null);
  const connectorRef = React.useRef<EditorHostConnector | null>(null);

  const pingSeqRef = React.useRef(0);
  const resolveSeqRef = React.useRef(0);

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
            if (!token) throw new Error("Missing preview token");
            const keyPathname = normalizePathname(pathname);
            const expectedRevision = draftRevisionsRef.current.get(keyPathname) ?? null;
            const pageId = draftPageIdsRef.current.get(keyPathname) ?? null;

            const payload = pageId
              ? await savePageDraftToApi({
                  siteId,
                  pageId,
                  token,
                  document,
                  expectedRevision,
                })
              : await saveRouteDraftToApi({
                  siteId,
                  pathname: keyPathname,
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
            if (payload.pageId) {
              draftPageIdsRef.current.set(payload.path, payload.pageId);
            }

            // If we saved by path (no pageId available yet), resolve again once to discover pageId.
            if (!payload.pageId) {
              const resolved = await resolveRouteFromApi(payload.path, siteId, {
                mode: "preview",
                token,
              });
              if (resolved.kind === "page") {
                const id = resolved.match.pageId;
                if (typeof id === "string" && id.trim()) {
                  draftPageIdsRef.current.set(payload.path, id);
                }
              }
            }
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
          siteId,
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
        setPreviewTokenError(null);
        const res = await fetch(
          `${getPortalApiPrefix()}/sites/${encodeURIComponent(siteId)}/preview-tokens`,
          {
            method: "POST",
            headers: { accept: "application/json" },
          },
        );
        if (!res.ok) throw new Error(`Failed to issue preview token (${res.status})`);
        const payload: unknown = await res.json();
        const token = parsePreviewToken(payload);
        if (!token) throw new Error("Invalid preview token response");
        if (!mounted) return;
        setPreviewToken(token);
      } catch {
        if (!mounted) return;
        setPreviewToken("");
        setPreviewTokenError("Failed to issue preview token. Ensure backend + Valkey are running.");
      }
    })();

    return () => {
      mounted = false;
    };
  }, [siteId]);

  React.useEffect(() => {
    // Initialize optimistic-lock pointers from the backend resolver so the first save after a refresh
    // doesn't accidentally bypass optimistic locking (pages), or hit a 409 (entries defaulting to 0).
    const token = previewToken;
    if (!token) return;
    const normalizedPathname = normalizePathname(pathname);
    const seq = ++resolveSeqRef.current;

    void (async () => {
      try {
        setRouteResolveError(null);
        const resolved = await resolveRouteFromApi(normalizedPathname, siteId, {
          mode: "preview",
          token,
        });
        if (seq !== resolveSeqRef.current) return;
        if (resolved.kind !== "page") return;

        const match = resolved.match;

        // Page draft optimistic lock.
        if (typeof match.draftRevision === "number" && Number.isFinite(match.draftRevision)) {
          // 0 is a valid "no draft yet" pointer and should be used as expectedRevision=0.
          draftRevisionsRef.current.set(normalizedPathname, Math.max(0, match.draftRevision));
        } else {
          draftRevisionsRef.current.delete(normalizedPathname);
        }

        if (typeof match.pageId === "string" && match.pageId.trim()) {
          draftPageIdsRef.current.set(normalizedPathname, match.pageId);
        } else {
          draftPageIdsRef.current.delete(normalizedPathname);
        }

        // Entry draft optimistic lock (route_template only).
        if (match.kind === "route_template") {
          const slug = match.params.slug;
          if (typeof slug === "string" && slug.trim()) {
            const draftRev = match.draftRevision;
            if (typeof draftRev === "number" && Number.isFinite(draftRev) && draftRev >= 0) {
              entryDraftRevisionsRef.current.set(slug, draftRev);
            }
          }
        }
      } catch (err) {
        if (seq !== resolveSeqRef.current) return;
        setRouteResolveError(err instanceof Error ? err.message : String(err));
      }
    })();
  }, [pathname, previewToken, siteId]);

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

  const activeEntrySlug = React.useMemo(() => {
    const normalized = normalizePathname(pathname);
    const m = /^\/blog\/([^/]+)$/.exec(normalized);
    return m?.[1] ?? null;
  }, [pathname]);

  const saveActiveEntryDraft = React.useCallback(() => {
    void (async () => {
      try {
        setEntrySaveStatus("saving");
        setEntrySaveError(null);
        const token = previewTokenRef.current;
        if (!token) throw new Error("Missing preview token");
        const slug = activeEntrySlug ?? "world";
        const expectedRevision = entryDraftRevisionsRef.current.get(slug) ?? 0;
        const payload = await saveEntryDraftToApi({
          siteId,
          token,
          entryTypeCode: "blog_post",
          slug,
          document: {
            version: 1,
            meta: { title: { "en-US": `Entry ${slug} (draft)` } },
            blocks: [
              {
                id: "h1",
                type: "heading",
                props: { level: 1, text: { "en-US": `Entry ${slug} (draft)` } },
              },
            ],
          },
          expectedRevision,
        });
        if (!payload) throw new Error("Invalid entry save response");
        setLastEntrySave(payload);
        entryDraftRevisionsRef.current.set(slug, payload.revision);
        setEntrySaveStatus("idle");
      } catch (err) {
        setEntrySaveStatus("error");
        setEntrySaveError(err instanceof Error ? err.message : String(err));
      }
    })();
  }, [activeEntrySlug, siteId]);

  const publishActiveEntry = React.useCallback(() => {
    void (async () => {
      try {
        setEntrySaveStatus("saving");
        setEntrySaveError(null);
        const token = previewTokenRef.current;
        if (!token) throw new Error("Missing preview token");
        const slug = activeEntrySlug ?? "world";
        const revision = entryDraftRevisionsRef.current.get(slug) ?? null;
        const ok = await publishEntryToApi({
          siteId,
          token,
          entryTypeCode: "blog_post",
          slug,
          revision,
        });
        if (!ok) throw new Error("Invalid entry publish response");
        setEntrySaveStatus("idle");
      } catch (err) {
        setEntrySaveStatus("error");
        setEntrySaveError(err instanceof Error ? err.message : String(err));
      }
    })();
  }, [activeEntrySlug, siteId]);

  return (
    <div className="portal-editor-host">
      <EditorHostToolbar
        overlayMode={overlayMode}
        lastPingRttMs={lastPingRttMs}
        lastPingError={lastPingError}
        previewToken={previewToken}
        previewTokenError={previewTokenError}
        selectedBlockId={selectedBlockId}
        pathname={pathname}
        routeResolveError={routeResolveError}
        activeEntrySlug={activeEntrySlug}
        lastPresence={lastPresence}
        saveStatus={saveStatus}
        lastSave={lastSave}
        saveError={saveError}
        entrySaveStatus={entrySaveStatus}
        lastEntrySave={lastEntrySave}
        entrySaveError={entrySaveError}
        onSetOverlayMode={setChildOverlayMode}
        onPing={() => {
          void sendPing();
        }}
        onResetDraft={() => {
          pushDraft(baseDoc);
        }}
        onPushDraft1={() => {
          pushDraft(draftDoc1);
        }}
        onSelectBlock={selectBlock}
        onSetPathname={setPathname}
        onSaveEntryDraft={saveActiveEntryDraft}
        onPublishEntry={publishActiveEntry}
      />
      <iframe
        ref={iframeRef}
        title="portal-editor-host"
        src={
          previewToken
            ? buildEditorIframeHref({ siteId, pathname, token: previewToken })
            : "about:blank"
        }
        className="portal-editor-host-iframe"
      />
    </div>
  );
}

export { EditorHostPage };
