import type {
  AnyEditorMessage,
  HostToPortalMessage,
  PortalToHostMessage,
} from "@celestial/site-editor-protocol";

import type { OriginMatcher } from "./origin";
import { isAllowedOrigin } from "./origin";

export type EditorBridgeOptions = {
  expectedOrigin: OriginMatcher;
  getTargetWindow: () => Window | null;
  targetOrigin: string;
};

export type EditorMessageHandler = (
  msg: AnyEditorMessage,
  helpers: { reply: (msg: AnyEditorMessage) => void },
) => void;

/**
 * Minimal postMessage bridge with:
 * - origin allowlist
 * - v1 envelope guard
 * - reply helper
 *
 * It is intentionally generic (host/portal can both use it).
 */
export function createEditorPostMessageBridge(opts: EditorBridgeOptions) {
  function post(msg: AnyEditorMessage) {
    const win = opts.getTargetWindow();
    if (!win) return;
    win.postMessage(msg, opts.targetOrigin);
  }

  function isAnyEditorMessage(data: unknown): data is AnyEditorMessage {
    if (!data || typeof data !== "object") return false;
    const rec = data as { version?: unknown; type?: unknown; payload?: unknown };
    if (rec.version !== 1) return false;
    if (typeof rec.type !== "string") return false;
    return "payload" in rec;
  }

  function onMessage(cb: EditorMessageHandler) {
    if (typeof window === "undefined") return () => {};

    const handler = (ev: MessageEvent) => {
      if (!isAllowedOrigin(ev.origin, opts.expectedOrigin)) return;
      if (!isAnyEditorMessage(ev.data)) return;
      cb(ev.data, { reply: post });
    };

    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }

  return {
    post,
    onMessage,
  };
}

export function isHostToPortalMessage(value: AnyEditorMessage): value is HostToPortalMessage {
  return (
    value.type === "PING" ||
    value.type === "SET_OVERLAY_MODE" ||
    value.type === "SELECT_BLOCK" ||
    value.type === "PUSH_DRAFT_DOCUMENT"
  );
}

export function isPortalToHostMessage(value: AnyEditorMessage): value is PortalToHostMessage {
  return value.type === "READY" || value.type === "PONG" || value.type === "SELECTION_CHANGED";
}
