# @arclayer/web

Shared web infrastructure for apps (Admin / Portal / future web apps).

Design goals
- Avoid copy-paste between apps.
- Keep abstractions minimal and explicit (Sprint 1: extract stable infra only).
- No UI dependencies (no antd / no react / no zustand).

What belongs here
- HTTP client primitives (error model, token refresh orchestration)
- App runtime config helpers (read/merge runtime config)
- Locale utilities (normalize/detect)
- Storage key helpers

What does NOT belong here
- App-specific stores, routes, UI components, product logic
