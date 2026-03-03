# @celestial/editor-bridge

Shared iframe transport helpers for the Portal editor iframe and the Admin host shell.

Goals:
- Keep the Admin <-> Portal iframe transport small and reusable (monorepo-friendly).
- Prefer a readable RPC-style API (Penpal) while keeping the underlying protocol typed and versioned.
- Keep origin/security concerns explicit (local dev allowlists via `parentOrigin`, plus transport-level checks).

Non-goals (for now):
- Full-featured RPC (retries, batching, schema validation)
- Building a general-purpose RPC framework (keep it CMS/editor focused)

Notes:
- The message-based postMessage helpers are still available for low-level debugging.
- Sprint 2+ uses Penpal for the actual Admin <-> Portal editor integration.
- `url.ts` provides small URL helpers (pathname normalization, editor iframe href building) to avoid duplication.
- `host-connector.ts` provides a tiny connection manager with reconnection-friendly semantics.
