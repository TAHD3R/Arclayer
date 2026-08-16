# Deliver Commerce and System Settings as full-stack vertical slices

**Status:** accepted

This rollout includes the real Platform API contracts, persistence/migrations, permission checks, revision/idempotency behavior, Audit evidence, Platform UI, bilingual copy, and focused tests for every accepted operation. Frontend-only placeholders, mock-success paths, static fake tables, and silent fallbacks are out of scope. Work is delivered in coherent vertical slices so each page action is server-confirmed before it is presented as applied.

**Consequences**

- Existing unavailable Provider ports and missing catalog/language contracts must be implemented or remain explicitly blocked with a real server reason.
- Validation includes `pnpm platform:check` plus affected API checks and focused contract tests at milestones.
- The rollout may touch both `apps/platform` and `apps/api`, plus shared OpenAPI/types and migrations, but no unrelated domain is refactored without an ownership reason.
