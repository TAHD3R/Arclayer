import * as React from "react";
import { useNavigate } from "@tanstack/react-router";

import type { HostEditorRpcApi } from "@celestial/editor-protocol";
import { createEditorHostConnector, isHttpOrigin } from "@celestial/editor-bridge";
import type { EditorHostConnector, EditorHostPenpalConnection } from "@celestial/editor-bridge";

export type BridgeStatus = "disconnected" | "connecting" | "connected";

export type PortalApi = EditorHostPenpalConnection["portal"];

export type UseEditorBridgeOptions = {
  iframeRef: React.RefObject<HTMLIFrameElement | null>;
  methods: HostEditorRpcApi;
  /** Whether the iframe element is expected to be in the DOM. */
  iframeReady: boolean;
  onConnected?: (portal: PortalApi) => void | Promise<void>;
};

export type UseEditorBridgeReturn = {
  status: BridgeStatus;
  error: string | null;
  portal: PortalApi | null;
};

export function useEditorBridge(opts: UseEditorBridgeOptions): UseEditorBridgeReturn {
  const { iframeRef, methods, iframeReady, onConnected } = opts;

  const [status, setStatus] = React.useState<BridgeStatus>("disconnected");
  const [error, setError] = React.useState<string | null>(null);
  const portalRef = React.useRef<PortalApi | null>(null);
  const connectorRef = React.useRef<EditorHostConnector | null>(null);

  // Stable ref for callbacks to avoid re-triggering the effect
  const methodsRef = React.useRef(methods);
  methodsRef.current = methods;
  const onConnectedRef = React.useRef(onConnected);
  onConnectedRef.current = onConnected;

  const portalOrigin = React.useMemo(() => {
    const raw = import.meta.env.VITE_PORTAL_ORIGIN;
    return raw && isHttpOrigin(raw) ? raw : "http://localhost:3100";
  }, []);

  React.useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    const connector = createEditorHostConnector({
      iframe,
      childOrigin: portalOrigin,
      methods: methodsRef.current,
      onConnected: async (portal) => {
        portalRef.current = portal;
        setStatus("connected");
        setError(null);
        await onConnectedRef.current?.(portal);
      },
      onError: (err) => {
        setStatus("disconnected");
        setError(err instanceof Error ? err.message : String(err));
      },
    });

    connectorRef.current = connector;

    const startConnect = () => {
      setStatus("connecting");
      setError(null);
      void connector.connect();
    };

    const onLoad = () => {
      portalRef.current = null;
      startConnect();
    };

    iframe.addEventListener("load", onLoad);
    const timer = window.setTimeout(startConnect, 0);

    return () => {
      iframe.removeEventListener("load", onLoad);
      window.clearTimeout(timer);
      portalRef.current = null;
      connector.disconnect();
      connectorRef.current = null;
      setStatus("disconnected");
    };
  }, [iframeRef, iframeReady, portalOrigin]);

  return {
    status,
    error,
    portal: portalRef.current,
  };
}

export function useRequestEditContentRef(opts: {
  workspaceId: string;
}): HostEditorRpcApi["requestEditContentRef"] {
  const navigate = useNavigate();

  return React.useCallback(
    ({ refEntryId }) => {
      if (!refEntryId) return;
      void navigate({
        to: "/w/$workspaceId/editor/$editorMode/$entityId",
        params: {
          workspaceId: opts.workspaceId,
          editorMode: "component",
          entityId: refEntryId,
        },
      });
    },
    [navigate, opts.workspaceId],
  );
}
