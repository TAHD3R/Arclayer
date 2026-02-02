import React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import type { DocumentIR } from "@celestial/site-block-protocol";
import type { EditorOverlayMode } from "@celestial/site-editor-protocol";
import { connectEditorHostToPortal, isHttpOrigin } from "@celestial/site-editor-bridge";

import { api } from "@/lib/http/client";

export const Route = createFileRoute("/debug/portal-editor")({
  component: PortalEditorDebugPage,
});

function PortalEditorDebugPage() {
  const { t } = useTranslation("debug");
  const iframeRef = React.useRef<HTMLIFrameElement | null>(null);

  const portalOrigin = React.useMemo(() => {
    const raw = import.meta.env.VITE_PORTAL_ORIGIN;
    return raw && isHttpOrigin(raw) ? raw : "http://localhost:3100";
  }, []);

  const [previewToken, setPreviewToken] = React.useState<string | null>(null);
  const previewTokenRef = React.useRef<string | null>(null);
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

  const hostOrigin = React.useMemo(() => {
    if (typeof window === "undefined") return "";
    return window.location.origin;
  }, []);

  const iframeSrc = React.useMemo(() => {
    if (!hostOrigin) return `${portalOrigin}/__editor/site/demo`;
    const url = new URL(
      `${portalOrigin}/__editor/site/demo${normalizePathname(pathname) === "/" ? "" : normalizePathname(pathname)}`,
    );
    // Token is required for editor mode; allow overriding via debug page query (?token=...).
    const tokenFromUrl = new URLSearchParams(window.location.search).get("token");
    const token = tokenFromUrl || previewToken || "demo";
    url.searchParams.set("token", token);
    url.searchParams.set("parentOrigin", hostOrigin);
    return url.toString();
  }, [hostOrigin, pathname, portalOrigin, previewToken]);

  React.useEffect(() => {
    previewTokenRef.current = previewToken;
  }, [previewToken]);

  React.useEffect(() => {
    let mounted = true;

    // Allow overriding token via URL; if provided we skip API token issuing.
    const tokenFromUrl = new URLSearchParams(window.location.search).get("token");
    if (tokenFromUrl) {
      setPreviewToken(tokenFromUrl);
      return () => {
        mounted = false;
      };
    }

    void (async () => {
      try {
        const siteId = "00000000-0000-0000-0000-000000000001";
        const out = await api.post<{ token: string; expiresAtMs: number }>(
          `/sites/${siteId}/preview-tokens`,
          {
            ttlSeconds: 600,
          },
        );
        if (!mounted) return;
        setPreviewToken(out.token);
      } catch {
        // Fallback to demo token: the debug page should remain usable even if backend isn't running.
        if (!mounted) return;
        setPreviewToken("demo");
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const [overlayMode, setOverlayMode] = React.useState<EditorOverlayMode>("inspect");
  const overlayModeRef = React.useRef<EditorOverlayMode>("inspect");
  const [selectedBlockId, setSelectedBlockId] = React.useState<string | null>(null);
  const [lastPingRttMs, setLastPingRttMs] = React.useState<number | null>(null);
  const [lastPingError, setLastPingError] = React.useState<string | null>(null);

  React.useEffect(() => {
    overlayModeRef.current = overlayMode;
  }, [overlayMode]);

  const portalRef = React.useRef<
    Awaited<ReturnType<typeof connectEditorHostToPortal>>["portal"] | null
  >(null);
  const destroyRef = React.useRef<(() => void) | null>(null);
  const pingSeqRef = React.useRef(0);

  const sendPing = React.useCallback(async (opts?: { silent?: boolean }) => {
    const portal = portalRef.current;
    if (!portal) return;
    const seq = ++pingSeqRef.current;
    try {
      if (!opts?.silent) setLastPingError(null);
      const sentAt = Date.now();
      await portal.ping({ sentAt });
      if (seq !== pingSeqRef.current) return;
      setLastPingRttMs(Date.now() - sentAt);
    } catch (err) {
      if (seq !== pingSeqRef.current) return;
      if (opts?.silent) return;
      setLastPingRttMs(null);
      setLastPingError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  const setChildOverlayMode = React.useCallback((mode: EditorOverlayMode) => {
    setOverlayMode(mode);
    void portalRef.current?.setOverlayMode({ mode });
    if (mode === "off") setSelectedBlockId(null);
  }, []);

  const selectBlock = React.useCallback((blockId: string | null) => {
    setSelectedBlockId(blockId);
    void portalRef.current?.selectBlock({ blockId });
  }, []);

  const baseDoc = React.useMemo(() => buildDebugBaseDocument(), []);
  const draftDoc1 = React.useMemo(() => buildDebugDraftDocument1(), []);

  const pushDraft = React.useCallback((document: DocumentIR) => {
    void portalRef.current?.pushDraftDocument({ document, pathname: "/" });
  }, []);

  React.useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    let mounted = true;

    void (async () => {
      const conn = await connectEditorHostToPortal({
        iframe,
        methods: {
          ready: ({ readyAt }) => {
            // eslint-disable-next-line no-console
            console.log("[admin portal-editor] ready:", { readyAt });
          },
          selectionChanged: ({ blockId }) => {
            setSelectedBlockId(blockId);
          },
          requestSave: ({ siteId, pathname, document }) => {
            void (async () => {
              try {
                setSaveStatus("saving");
                setSaveError(null);
                const tokenFromUrl = new URLSearchParams(window.location.search).get("token");
                const token = tokenFromUrl || previewTokenRef.current || "demo";
                const expectedRevision = draftRevisionsRef.current.get(pathname) ?? null;
                const out = await api.post<{ path: string; revision: number; savedAtMs: number }>(
                  `/sites/${encodeURIComponent(siteId)}/routes/draft?token=${encodeURIComponent(token)}`,
                  {
                    path: pathname,
                    document,
                    ...(expectedRevision ? { expectedRevision } : {}),
                  },
                );
                setLastSave({
                  pathname: out.path,
                  revision: out.revision,
                  savedAtMs: out.savedAtMs,
                });
                draftRevisionsRef.current.set(out.path, out.revision);
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
        childOrigin: portalOrigin,
      });

      if (!mounted) {
        conn.destroy();
        return;
      }
      const version = await conn.portal.getProtocolVersion();
      if (version !== 1) {
        // eslint-disable-next-line no-console
        console.error("[admin portal-editor] Unsupported protocol version:", version);
        conn.destroy();
        return;
      }
      portalRef.current = conn.portal;
      destroyRef.current = conn.destroy;

      void sendPing({ silent: true });
      void conn.portal.setOverlayMode({ mode: overlayModeRef.current });
    })();

    return () => {
      mounted = false;
      portalRef.current = null;
      destroyRef.current?.();
      destroyRef.current = null;
    };
  }, [portalOrigin, sendPing]);

  React.useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const onLoad = () => {
      void sendPing({ silent: true });
    };
    iframe.addEventListener("load", onLoad);
    const timer = window.setTimeout(() => void sendPing({ silent: true }), 0);
    return () => {
      iframe.removeEventListener("load", onLoad);
      window.clearTimeout(timer);
    };
  }, [sendPing]);

  return (
    <div className="flex h-dvh w-full flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-gray-200 bg-white p-3 text-xs">
        <div className="mr-2 font-medium">{t("PORTAL_EDITOR_DEBUG_TITLE")}</div>
        <div className="text-gray-600">
          {t("PORTAL_ORIGIN")}: <code>{portalOrigin}</code>
        </div>
        <div className="text-gray-600">
          {t("OVERLAY")}: <code>{overlayMode}</code>
        </div>
        <div className="text-gray-600">
          {t("PING")}:{" "}
          <code>
            {lastPingRttMs !== null
              ? `${lastPingRttMs}ms`
              : lastPingError
                ? t("PING_STATUS_ERROR")
                : t("PING_STATUS_NA")}
          </code>
        </div>
        {lastPingError ? (
          <div className="text-red-600">
            {t("PING_ERROR")}: <code>{lastPingError}</code>
          </div>
        ) : null}
        <div className="text-gray-600">
          {t("SELECTED")}: <code>{selectedBlockId ?? t("VALUE_NULL")}</code>
        </div>
        <div className="text-gray-600">
          Path: <code>{normalizePathname(pathname)}</code>
        </div>
        <div className="text-gray-600">
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
        </div>
        {saveError ? (
          <div className="text-red-600">
            Save error: <code>{saveError}</code>
          </div>
        ) : null}
        {lastPresence ? (
          <div className="text-gray-600">
            Presence:{" "}
            <code>
              {lastPresence.pathname} / {String(lastPresence.overlayMode)} /{" "}
              {lastPresence.selectedBlockId ?? "null"} /{" "}
              {lastPresence.hasDraftOverride ? "draft" : "base"}
            </code>
          </div>
        ) : null}

        <div className="mx-2 h-4 w-px bg-gray-200" aria-hidden="true" />

        <button className="rounded border px-2 py-1" type="button" onClick={() => setPathname("/")}>
          Go /
        </button>
        <button
          className="rounded border px-2 py-1"
          type="button"
          onClick={() => setPathname("/about")}
        >
          Go /about
        </button>
        <button
          className="rounded border px-2 py-1"
          type="button"
          onClick={() => setPathname("/blog/hello")}
        >
          Go /blog/hello
        </button>
        <button
          className="rounded border px-2 py-1"
          type="button"
          onClick={() => setPathname("/old-about")}
        >
          Go /old-about
        </button>

        <div className="mx-2 h-4 w-px bg-gray-200" aria-hidden="true" />

        <button
          className="rounded border px-2 py-1"
          type="button"
          onClick={() => setChildOverlayMode("off")}
        >
          {t("OVERLAY_OFF")}
        </button>
        <button
          className="rounded border px-2 py-1"
          type="button"
          onClick={() => setChildOverlayMode("inspect")}
        >
          {t("OVERLAY_INSPECT")}
        </button>
        <button
          className="rounded border px-2 py-1"
          type="button"
          onClick={() => setChildOverlayMode("edit")}
        >
          {t("OVERLAY_EDIT")}
        </button>
        <button
          className="rounded border px-2 py-1"
          type="button"
          onClick={() => {
            void sendPing();
          }}
        >
          {t("PING_BUTTON")}
        </button>

        <div className="mx-2 h-4 w-px bg-gray-200" aria-hidden="true" />

        <button
          className="rounded border px-2 py-1"
          type="button"
          onClick={() => pushDraft(baseDoc)}
        >
          {t("RESET_DRAFT")}
        </button>
        <button
          className="rounded border px-2 py-1"
          type="button"
          onClick={() => pushDraft(draftDoc1)}
        >
          {t("PUSH_DRAFT_1")}
        </button>
        <button
          className="rounded border px-2 py-1"
          type="button"
          onClick={() => selectBlock("b1-h1")}
        >
          {t("SELECT_B1_H1")}
        </button>
        <button
          className="rounded border px-2 py-1"
          type="button"
          onClick={() => selectBlock("b1-p1")}
        >
          {t("SELECT_B1_P1")}
        </button>
        <button
          className="rounded border px-2 py-1"
          type="button"
          onClick={() => selectBlock(null)}
        >
          {t("CLEAR_SELECTION")}
        </button>
      </div>

      <iframe
        ref={iframeRef}
        title="portal-editor-iframe"
        src={iframeSrc}
        className="h-full w-full border-0"
      />
    </div>
  );
}

function buildDebugBaseDocument(): DocumentIR {
  return {
    version: 1,
    meta: {
      title: { "zh-CN": "Portal Editor (Admin Host)", "en-US": "Portal Editor (Admin Host)" },
      description: {
        "zh-CN": "Admin 侧联调页：验证 iframe 通信与脏数据预览。",
        "en-US": "Admin debug page: validate iframe messaging and draft preview.",
      },
    },
    blocks: [
      {
        id: "b1",
        type: "container",
        props: { as: "section" },
        children: [
          {
            id: "b1-h1",
            type: "heading",
            props: {
              level: 1,
              text: { "zh-CN": "来自 Admin 的 Draft", "en-US": "Draft from Admin" },
            },
          },
          {
            id: "b1-p1",
            type: "paragraph",
            props: {
              text: {
                "zh-CN": "该内容通过 postMessage PUSH_DRAFT_DOCUMENT 推送到 Portal iframe。",
                "en-US":
                  "This content is pushed into the Portal iframe via postMessage (PUSH_DRAFT_DOCUMENT).",
              },
            },
          },
        ],
      },
    ],
  };
}

function buildDebugDraftDocument1(): DocumentIR {
  const base = buildDebugBaseDocument();
  return {
    ...base,
    meta: {
      ...base.meta,
      title: { "zh-CN": "Draft #1", "en-US": "Draft #1" },
    },
    blocks: base.blocks.map((b) => {
      if (b.type !== "container" || !b.children) return b;
      return Object.assign({}, b, {
        children: b.children.map((c) => {
          if (c.id !== "b1-h1") return c;
          return Object.assign({}, c, {
            props: Object.assign({}, c.props, {
              text: {
                "zh-CN": "这是 Draft #1（来自 Admin）",
                "en-US": "This is Draft #1 (from Admin)",
              },
            }),
          });
        }),
      });
    }),
  };
}

function normalizePathname(pathnameRaw: string): string {
  const pathname = pathnameRaw.startsWith("/") ? pathnameRaw : `/${pathnameRaw}`;
  if (pathname === "/") return "/";
  return pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
}
