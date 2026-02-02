# @celestial/site-editor-bridge

Shared postMessage + minimal RPC helpers for the Portal editor iframe and the Admin host shell.

Goals:
- Keep the Admin <-> Portal iframe transport small and reusable (monorepo-friendly).
- Enforce strict `origin` checks (allowlist).
- Provide a minimal requestId-based ping/pong RPC used by local debug harness pages.

Non-goals (for now):
- Full-featured RPC (retries, batching, schema validation)
- Introducing external dependencies (e.g. penpal) before the protocol stabilizes
