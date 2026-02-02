import React from "react";
import { createFileRoute } from "@tanstack/react-router";

import type { EditorOverlayMode } from "@celestial/site-editor-protocol";
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

  const pushDraft = React.useCallback((document: CoreDocumentIR) => {
    void portalRef.current?.pushDraftDocument({ document, pathname: "/" });
  }, []);

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
        const payload = (await res.json()) as any;
        const token = String(payload?.data?.token ?? "").trim();
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
      </div>
      <iframe
        ref={iframeRef}
        title="portal-editor-host"
        src={`/__editor/site/demo?token=${encodeURIComponent(previewToken)}`}
        className="portal-editor-host-iframe"
      />
    </div>
  );
}
