# @celestial/site-block-protocol

Sprint 1 minimal Block Protocol (TypeScript) used by Portal/Editor.

Why this package exists
- The protocol is shared infrastructure across apps (Admin/Portal/future plugins). Keeping it in `packages/` avoids copy-paste.
- Sprint 1 focuses on TypeScript-level constraints; later sprints will add backend Pydantic v2 validation for end-to-end safety.

Maintenance rules
- Protocol only: no rendering code, no UI components.
- Any breaking change must be coordinated (especially around `props` and schema constraints).
