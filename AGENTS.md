# Arclayer Agents Guide

Actionable rules for automated coding agents — keep diffs minimal, safe, and repo-aligned.

## Source-of-Truth Routing

Use this routing model for every change:

- Implementation contracts (canonical): `docs/spec/**`
- Trellis runtime mirror (generated): `.trellis/spec/**`
- Non-spec guidance: `docs/guidelines/**`
- Visual language source: `DESIGN.md`
- Admin design implementation guide: `docs/guidelines/frontend-design.md`

`docs/spec/** -> .trellis/spec/**` is one-way. Do not hand-edit `.trellis/spec/**`.

## Repo Map

- Monorepo: Turborepo + pnpm workspace
- Backend API: `apps/api`
- Admin frontend: `apps/admin`
- Shared packages: `packages/*`
- Plugins: `plugins/*`

## Command Discipline

Use repo scripts only:

- `pnpm <script>`
- `pnpm --filter <pkg> <script>`
- `pnpm -C <dir> <script>`

Do not:

- run `.venv/bin/*` directly
- hand-edit generated artifacts
- run long-lived dev servers unless requested

## Spec Mirror Workflow

When `docs/spec/**` changes:

1. run `pnpm spec:sync`
2. run `pnpm spec:check`

`spec:sync` may overwrite `.trellis/spec/**`.
`spec:check` must be side-effect free.

## Validation Fast Path

- API-only changes: `pnpm api:check`
- Admin-only changes: `pnpm admin:check`
- Cross-app changes: `pnpm check`

## Guidelines Directory Policy

`docs/guidelines/**` stores non-spec guidance only.

- Keep: `agents-guide.md`, `code-review-engine.md`, `frontend-design.md`
- Pending migration material: `images-api.md`, `search-integration.md`
- Do not route implementation contracts from `docs/guidelines/**`

## Frontend Execution Contract

- Active frontend scope: `apps/admin` and Admin-facing surfaces in `packages/ui`
- `DESIGN.md` is the primary visual language source
- For design-sensitive changes, align with `docs/guidelines/frontend-design.md`

## Repo Intelligence Workflow

For medium+ tasks, architecture questions, or multi-file refactors:

1. `GitNexus` for discovery and impact
2. `code-review-graph` for review context and blast radius
3. `serena` for symbol-level precision

Prefer live repo truth if indexes are stale or unavailable.

## Safety Baseline

- No silent fallbacks or mock-success paths.
- Keep one canonical contract surface after hard-cut changes.
- Remove superseded shims/facades in the same rollout unless explicitly approved.
- Do not touch lockfiles, caches, build outputs, or `node_modules/` unless the task requires it.

## Trellis

Trellis workflow and task context live under `.trellis/`.
If task tools are available, prefer them for task lifecycle operations.
