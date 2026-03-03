# @celestial/renderer

Site rendering core (Sprint 1 minimal implementation).

Scope (Sprint 1)
- Input: `ViewerContext + PageBlueprint` (editor-first document tree)
- Output: React element tree (usable in SSR/CSR)
- Minimal built-in blocks (heading/paragraph/container/divider) to validate the protocol and SSR pipeline

Non-goals (Sprint 1)
- No full theme/plugin system (future sprint)
- No Admin editor UI

Maintenance rules
- Rendering core only; avoid app-level dependencies (e.g. antd, zustand).
