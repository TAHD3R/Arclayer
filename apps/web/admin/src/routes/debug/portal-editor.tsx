import React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import type { DocumentIR } from "@celestial/site-block-protocol";
import type { EditorOverlayMode, HostToPortalMessage } from "@celestial/site-editor-protocol";
import {
  createEditorPostMessageBridge,
  createEditorRpcClient,
  isHttpOrigin,
  isPortalToHostMessage,
} from "@celestial/site-editor-bridge";

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

  const hostOrigin = React.useMemo(() => {
    if (typeof window === "undefined") return "";
    return window.location.origin;
  }, []);

  const iframeSrc = React.useMemo(() => {
    if (!hostOrigin) return `${portalOrigin}/__editor/site/demo`;
    const url = new URL(`${portalOrigin}/__editor/site/demo`);
    url.searchParams.set("parentOrigin", hostOrigin);
    return url.toString();
  }, [hostOrigin, portalOrigin]);

  const [overlayMode, setOverlayMode] = React.useState<EditorOverlayMode>("inspect");
  const overlayModeRef = React.useRef<EditorOverlayMode>("inspect");
  const [selectedBlockId, setSelectedBlockId] = React.useState<string | null>(null);
  const [lastPingRttMs, setLastPingRttMs] = React.useState<number | null>(null);
  const [lastPingError, setLastPingError] = React.useState<string | null>(null);

  React.useEffect(() => {
    overlayModeRef.current = overlayMode;
  }, [overlayMode]);

  const postToIframe = React.useCallback(
    (msg: HostToPortalMessage) => {
      const win = iframeRef.current?.contentWindow;
      if (!win) return;
      win.postMessage(msg, portalOrigin);
    },
    [portalOrigin],
  );

  const rpcRef = React.useRef<ReturnType<typeof createEditorRpcClient> | null>(null);
  const pingSeqRef = React.useRef(0);

  const sendPing = React.useCallback(async (opts?: { silent?: boolean }) => {
    const rpc = rpcRef.current;
    if (!rpc) return;
    const seq = ++pingSeqRef.current;
    try {
      if (!opts?.silent) setLastPingError(null);
      const { rttMs } = await rpc.ping();
      if (seq !== pingSeqRef.current) return;
      setLastPingRttMs(rttMs);
    } catch (err) {
      if (seq !== pingSeqRef.current) return;
      if (opts?.silent) return;
      setLastPingRttMs(null);
      setLastPingError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  const setChildOverlayMode = React.useCallback(
    (mode: EditorOverlayMode) => {
      setOverlayMode(mode);
      postToIframe({ version: 1, type: "SET_OVERLAY_MODE", payload: { mode } });
      if (mode === "off") setSelectedBlockId(null);
    },
    [postToIframe],
  );

  const selectBlock = React.useCallback(
    (blockId: string | null) => {
      setSelectedBlockId(blockId);
      postToIframe({ version: 1, type: "SELECT_BLOCK", payload: { blockId } });
    },
    [postToIframe],
  );

  const baseDoc = React.useMemo(() => buildDebugBaseDocument(), []);
  const draftDoc1 = React.useMemo(() => buildDebugDraftDocument1(), []);

  const pushDraft = React.useCallback(
    (document: DocumentIR) => {
      postToIframe({ version: 1, type: "PUSH_DRAFT_DOCUMENT", payload: { document } });
    },
    [postToIframe],
  );

  React.useEffect(() => {
    rpcRef.current = createEditorRpcClient({ postMessage: postToIframe });

    const bridge = createEditorPostMessageBridge({
      expectedOrigin: portalOrigin,
      targetOrigin: portalOrigin,
      getTargetWindow: () => iframeRef.current?.contentWindow ?? null,
    });

    const unsubscribe = bridge.onMessage((msg) => {
      if (!isPortalToHostMessage(msg)) return;
      rpcRef.current?.onPortalMessage(msg);

      // eslint-disable-next-line no-console
      console.log("[admin portal-editor] message:", msg);

      if (msg.type === "READY") {
        void sendPing();
        postToIframe({
          version: 1,
          type: "SET_OVERLAY_MODE",
          payload: { mode: overlayModeRef.current },
        });
      }

      if (msg.type === "SELECTION_CHANGED") {
        setSelectedBlockId(msg.payload.blockId);
      }
    });

    return () => {
      unsubscribe();
      rpcRef.current?.dispose();
      rpcRef.current = null;
    };
  }, [portalOrigin, postToIframe, sendPing]);

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

      b.children = b.children.map((c) => {
        if (c.id !== "b1-h1") return c;

        (c.props as Record<string, unknown>).text = {
          "zh-CN": "这是 Draft #1（来自 Admin）",
          "en-US": "This is Draft #1 (from Admin)",
        };
        return c;
      });

      return b;
    }),
  };
}
