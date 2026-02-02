import React from "react";
import { createFileRoute } from "@tanstack/react-router";

import type { PortalToHostMessage } from "@celestial/site-editor-protocol";
import type { HostToPortalMessage } from "@celestial/site-editor-protocol";
import type { EditorOverlayMode } from "@celestial/site-editor-protocol";
import type { CoreDocumentIR } from "@celestial/site-renderer-core";

import { getHardcodedDocument } from "@/runtime/hardcoded-document";
import { createEditorRpcClient } from "@/editor/rpc";

export const Route = createFileRoute("/editor-host")({
  component: EditorHostPage,
});

function EditorHostPage() {
  const iframeRef = React.useRef<HTMLIFrameElement | null>(null);
  const [overlayMode, setOverlayMode] = React.useState<EditorOverlayMode>("inspect");
  const [selectedBlockId, setSelectedBlockId] = React.useState<string | null>(null);
  const [lastPingRttMs, setLastPingRttMs] = React.useState<number | null>(null);
  const [lastPingError, setLastPingError] = React.useState<string | null>(null);

  const postToIframeRaw = React.useCallback((msg: HostToPortalMessage) => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    iframe.contentWindow?.postMessage(msg, window.location.origin);
  }, []);

  const rpcRef = React.useRef<ReturnType<typeof createEditorRpcClient> | null>(null);

  const pingSeqRef = React.useRef(0);

  const sendPing = React.useCallback(async (opts?: { silent?: boolean }) => {
    const rpc = rpcRef.current;
    if (!rpc) return;
    const seq = ++pingSeqRef.current;
    try {
      if (!opts?.silent) setLastPingError(null);
      const { rttMs } = await rpc.ping();
      // Guard against older concurrent pings overwriting newer results.
      if (seq !== pingSeqRef.current) return;
      setLastPingRttMs(rttMs);
    } catch (err) {
      if (seq !== pingSeqRef.current) return;
      if (opts?.silent) return;
      setLastPingRttMs(null);
      setLastPingError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  const postToIframe = React.useCallback(
    (msg: HostToPortalMessage) => {
      postToIframeRaw(msg);
    },
    [postToIframeRaw],
  );

  const pushDraft = React.useCallback(
    (document: CoreDocumentIR) => {
      postToIframe({ version: 1, type: "PUSH_DRAFT_DOCUMENT", payload: { document } });
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

  const setChildOverlayMode = React.useCallback(
    (mode: EditorOverlayMode) => {
      setOverlayMode(mode);
      postToIframe({ version: 1, type: "SET_OVERLAY_MODE", payload: { mode } });
      if (mode === "off") {
        // Keep host UI consistent with iframe behavior.
        setSelectedBlockId(null);
      }
    },
    [postToIframe],
  );

  React.useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    rpcRef.current = createEditorRpcClient({
      expectedOrigin: window.location.origin,
      postMessage: postToIframeRaw,
    });

    const handler = (ev: MessageEvent) => {
      // Same-origin test harness only.
      if (ev.origin !== window.location.origin) return;
      const msg = ev.data as PortalToHostMessage;
      if (!msg || typeof msg !== "object") return;
      if (msg.version !== 1) return;

      rpcRef.current?.onMessage(msg);
      // Intentionally minimal: this page is only for validating the postMessage transport.
      // eslint-disable-next-line no-console
      console.log("[portal editor host] message:", msg);

      // The iframe may load fast enough that the `load` event is missed.
      // We ping again when we receive READY to make the handshake deterministic.
      if (msg.type === "READY") {
        sendPing();
        // Ensure overlay mode is applied even if the iframe refreshes.
        postToIframe({ version: 1, type: "SET_OVERLAY_MODE", payload: { mode: overlayMode } });
      }

      if (msg.type === "SELECTION_CHANGED") {
        setSelectedBlockId(msg.payload.blockId);
      }
    };

    window.addEventListener("message", handler);
    return () => {
      window.removeEventListener("message", handler);
      rpcRef.current?.dispose();
      rpcRef.current = null;
    };
  }, [overlayMode, postToIframe, postToIframeRaw, sendPing]);

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
      </div>
      <iframe
        ref={iframeRef}
        title="portal-editor-host"
        src="/__editor/site/demo"
        className="portal-editor-host-iframe"
      />
    </div>
  );
}
