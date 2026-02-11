import React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import type { DocumentIR } from "@celestial/site-block-protocol";
import type { EditorOverlayMode } from "@celestial/site-editor-protocol";
import {
  buildEditorIframeHref,
  createEditorHostConnector,
  isHttpOrigin,
  normalizePathname,
} from "@celestial/site-editor-bridge";
import type {
  EditorHostConnector,
  EditorHostPenpalConnection,
} from "@celestial/site-editor-bridge";
import { ApiError } from "@celestial/web-core/http";

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
    if (!hostOrigin) return `${portalOrigin}/editor/site/demo`;
    // Token is required for editor mode; allow overriding via debug page query (?token=...).
    const tokenFromUrl = new URLSearchParams(window.location.search).get("token");
    const token = tokenFromUrl || previewToken || "demo";
    return buildEditorIframeHref({
      portalOrigin,
      siteId: "demo",
      pathname,
      token,
      parentOrigin: hostOrigin,
    });
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

  const portalRef = React.useRef<EditorHostPenpalConnection["portal"] | null>(null);
  const connectorRef = React.useRef<EditorHostConnector | null>(null);
  const pingSeqRef = React.useRef(0);

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

  const pushDraft = React.useCallback(
    (document: DocumentIR) => {
      void portalRef.current?.pushDraftDocument({
        document,
        pathname: normalizePathname(pathname),
      });
    },
    [pathname],
  );

  React.useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    const connector = createEditorHostConnector({
      iframe,
      childOrigin: portalOrigin,
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
                  ...(expectedRevision !== null ? { expectedRevision } : {}),
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
              setSaveError(formatSaveError(err, t));
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
  }, [portalOrigin, sendPing]);

  return (
    <div className="flex h-dvh w-full flex-col">
      <div className="flex items-center gap-2 border-b border-gray-200 bg-white p-3 text-xs">
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
          {t("PATH_LABEL")}: <code>{normalizePathname(pathname)}</code>
        </div>
        <div className="text-gray-600">
          {t("SAVE_LABEL")}:{" "}
          <code>
            {saveStatus === "saving"
              ? t("SAVE_STATUS_SAVING")
              : saveStatus === "error"
                ? t("SAVE_STATUS_ERROR")
                : lastSave
                  ? `rev ${lastSave.revision}`
                  : t("SAVE_STATUS_NA")}
          </code>
        </div>
        {saveError ? (
          <div className="text-red-600">
            {t("SAVE_ERROR_LABEL")}: <code>{saveError}</code>
          </div>
        ) : null}
        {lastPresence ? (
          <div className="text-gray-600">
            {t("PRESENCE_LABEL")}:{" "}
            <code>
              {lastPresence.pathname} / {String(lastPresence.overlayMode)} /{" "}
              {lastPresence.selectedBlockId ?? t("VALUE_NULL")} /{" "}
              {lastPresence.hasDraftOverride ? t("PRESENCE_VALUE_DRAFT") : t("PRESENCE_VALUE_BASE")}
            </code>
          </div>
        ) : null}

        <div className="mx-2 h-4 w-px bg-gray-200" aria-hidden="true" />

        <button className="rounded border px-2 py-1" type="button" onClick={() => setPathname("/")}>
          {t("NAV_GO_HOME")}
        </button>
        <button
          className="rounded border px-2 py-1"
          type="button"
          onClick={() => setPathname("/about")}
        >
          {t("NAV_GO_ABOUT")}
        </button>
        <button
          className="rounded border px-2 py-1"
          type="button"
          onClick={() => setPathname("/blog/hello")}
        >
          {t("NAV_GO_BLOG_HELLO")}
        </button>
        <button
          className="rounded border px-2 py-1"
          type="button"
          onClick={() => setPathname("/old-about")}
        >
          {t("NAV_GO_OLD_ABOUT")}
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

function formatSaveError(
  err: unknown,
  t: (key: string, vars?: Record<string, unknown>) => string,
): string {
  if (err instanceof ApiError && err.status === 409) {
    const meta = err.meta;
    if (meta && typeof meta === "object") {
      const rec = meta as Record<string, unknown>;
      const expected = rec.expectedRevision;
      const current = rec.currentRevision;
      if (typeof expected === "number" && typeof current === "number") {
        return t("DRAFT_CONFLICT", { expected, current });
      }
    }
    return t("DRAFT_CONFLICT_GENERIC");
  }
  return err instanceof Error ? err.message : String(err);
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

// normalizePathname is provided by @celestial/site-editor-bridge
