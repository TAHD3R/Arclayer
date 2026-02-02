# @celestial/site-editor-protocol

Type-safe message protocol between:
- Admin shell (parent window)
- Portal editor mode (iframe)

Scope
- Define a versioned, minimal, extensible message schema
- Keep it framework-agnostic (can be used with `postMessage`, Penpal, or any RPC wrapper)

Non-goals (Sprint 1/2)
- No transport implementation (no Penpal wiring here)
- No permission/auth enforcement (handled by apps)
