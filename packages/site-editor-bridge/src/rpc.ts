import type {
  HostToPortalMessage,
  PortalToHostMessage,
  RpcRequestId,
} from "@celestial/site-editor-protocol";

export type EditorRpcClientOptions = {
  postMessage: (msg: HostToPortalMessage) => void;
};

export type EditorRpcClient = {
  ping: (opts?: { timeoutMs?: number }) => Promise<{ rttMs: number }>;
  dispose: () => void;
  onPortalMessage: (msg: PortalToHostMessage) => void;
};

/**
 * Minimal RPC helper for Sprint 2:
 * - Deterministic "PING -> PONG" roundtrip, matching by requestId.
 *
 * Note:
 * - This is not a general-purpose RPC framework.
 * - It exists so we can evolve the protocol without copying infra code between apps.
 */
export function createEditorRpcClient(opts: EditorRpcClientOptions): EditorRpcClient {
  const pending = new Map<RpcRequestId, { sentAt: number; resolve: (rttMs: number) => void }>();

  function onPortalMessage(msg: PortalToHostMessage) {
    if (msg.version !== 1) return;
    if (msg.type !== "PONG") return;
    if (!msg.requestId) return;

    const entry = pending.get(msg.requestId);
    if (!entry) return;
    pending.delete(msg.requestId);
    entry.resolve(Date.now() - entry.sentAt);
  }

  async function ping(optsPing?: { timeoutMs?: number }): Promise<{ rttMs: number }> {
    const requestId = createRequestId();
    const sentAt = Date.now();

    const p = new Promise<number>((resolve) => {
      pending.set(requestId, { sentAt, resolve });
    });

    opts.postMessage({
      version: 1,
      type: "PING",
      requestId,
      payload: { sentAt },
    });

    const rttMs = await withTimeout(p, optsPing?.timeoutMs ?? 1500);
    return { rttMs };
  }

  function dispose() {
    pending.clear();
  }

  return { ping, dispose, onPortalMessage };
}

function createRequestId(): RpcRequestId {
  // Browser-only helper. Avoid calling this during SSR render.
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return (crypto as unknown as { randomUUID: () => string }).randomUUID();
  }
  // Fallback: deterministic enough for local dev; not used for security purposes.
  return `r_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = window.setTimeout(() => {
      reject(new Error(`Editor RPC timeout after ${timeoutMs}ms`));
    }, timeoutMs);

    promise.then(
      (v) => {
        window.clearTimeout(t);
        resolve(v);
      },
      (err) => {
        window.clearTimeout(t);
        reject(err);
      },
    );
  });
}
