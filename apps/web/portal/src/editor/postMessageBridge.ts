import type { HostToPortalMessage, PortalToHostMessage } from "@celestial/site-editor-protocol";

export type EditorBridgeOptions = {
  // For Sprint 2 we keep it strict: only accept messages from the same origin.
  // In later sprints (subdomain deployment), this can become a configurable allowlist.
  expectedOrigin: string;
};

export function createEditorPostMessageBridge(opts: EditorBridgeOptions) {
  function postToParent(msg: PortalToHostMessage) {
    if (typeof window === "undefined") return;
    if (!window.parent || window.parent === window) return;
    window.parent.postMessage(msg, opts.expectedOrigin);
  }

  function isHostToPortalMessage(data: unknown): data is HostToPortalMessage {
    if (!data || typeof data !== "object") return false;
    const rec = data as { version?: unknown; type?: unknown; payload?: unknown };
    if (rec.version !== 1) return false;
    if (typeof rec.type !== "string") return false;
    return "payload" in rec;
  }

  function onMessage(
    cb: (msg: HostToPortalMessage, helpers: { reply: (msg: PortalToHostMessage) => void }) => void,
  ) {
    if (typeof window === "undefined") return () => {};

    const handler = (ev: MessageEvent) => {
      if (ev.origin !== opts.expectedOrigin) return;
      if (!isHostToPortalMessage(ev.data)) return;
      cb(ev.data, { reply: postToParent });
    };

    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }

  return {
    postToParent,
    onMessage,
  };
}
