import type {
  HostToPortalMessage,
  PortalToHostMessage,
  RpcRequestId,
} from "@celestial/site-editor-protocol";

export type EditorRpcClientOptions = {
  expectedOrigin: string;
  postMessage: (msg: HostToPortalMessage) => void;
};

export type EditorRpcClient = {
  ping: () => Promise<{ rttMs: number }>;
  dispose: () => void;
  onMessage: (msg: PortalToHostMessage) => void;
};

/**
 * Minimal RPC helper for Sprint 2 local harness.
 *
 * Goals:
 * - Deterministic "PING -> PONG" roundtrip, matching by requestId
 * - No dependency on penpal yet
 *
 * Non-goals (Sprint 2):
 * - General request/response mapping for every message type
 * - Retry/backoff
 */
export function createEditorRpcClient(opts: EditorRpcClientOptions): EditorRpcClient {
  const pending = new Map<RpcRequestId, { sentAt: number; resolve: (rttMs: number) => void }>();

  function onMessage(msg: PortalToHostMessage) {
    if (msg.version !== 1) return;
    if (msg.type !== "PONG") return;
    if (!msg.requestId) return;

    const entry = pending.get(msg.requestId);
    if (!entry) return;
    pending.delete(msg.requestId);
    entry.resolve(Date.now() - entry.sentAt);
  }

  async function ping(): Promise<{ rttMs: number }> {
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

    const rttMs = await withTimeout(p, 1500);
    return { rttMs };
  }

  function dispose() {
    pending.clear();
  }

  return { ping, dispose, onMessage };
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
