import type { HostEditorRpcApi, EditorProtocolVersion } from "@celestial/site-editor-protocol";

import type { EditorHostPenpalConnection, EditorHostPenpalOptions } from "./penpal";
import { connectEditorHostToPortal } from "./penpal";

export type EditorHostConnector = {
  connect: (opts?: { silent?: boolean }) => Promise<void>;
  disconnect: () => void;
  getPortal: () => EditorHostPenpalConnection["portal"] | null;
};

export function createEditorHostConnector(opts: {
  iframe: HTMLIFrameElement;
  childOrigin?: string;
  methods: HostEditorRpcApi;
  expectedProtocolVersion?: EditorProtocolVersion;
  timeoutMs?: number;
  debug?: boolean;
  /**
   * Test hook: allow injecting a custom connect implementation.
   * Production code should use the default (Penpal).
   */
  connectImpl?: (args: EditorHostPenpalOptions) => Promise<EditorHostPenpalConnection>;
  onConnected?: (portal: EditorHostPenpalConnection["portal"]) => void | Promise<void>;
  onError?: (err: unknown) => void;
}): EditorHostConnector {
  let seq = 0;
  let current: EditorHostPenpalConnection | null = null;

  const expected = opts.expectedProtocolVersion ?? 1;
  const connectImpl = opts.connectImpl ?? connectEditorHostToPortal;

  const disconnect = () => {
    current?.destroy();
    current = null;
  };

  const connect = async (args?: { silent?: boolean }) => {
    const mySeq = ++seq;
    disconnect();

    try {
      const penpalOpts: EditorHostPenpalOptions = {
        iframe: opts.iframe,
        methods: opts.methods,
        ...(opts.childOrigin ? { childOrigin: opts.childOrigin } : {}),
        ...(opts.timeoutMs ? { timeoutMs: opts.timeoutMs } : {}),
        ...(opts.debug !== undefined ? { debug: opts.debug } : {}),
      };

      const conn = await connectImpl(penpalOpts);
      if (mySeq !== seq) {
        conn.destroy();
        return;
      }

      const version = await conn.portal.getProtocolVersion();
      if (version !== expected) {
        conn.destroy();
        return;
      }

      current = conn;
      await opts.onConnected?.(conn.portal);
    } catch (err) {
      if (!args?.silent) opts.onError?.(err);
      // Ensure we don't keep a half-open connection around.
      if (mySeq === seq) disconnect();
    }
  };

  const getPortal = () => current?.portal ?? null;

  return { connect, disconnect, getPortal };
}
