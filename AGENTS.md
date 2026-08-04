# Arclayer Agents Guide

Actionable rules for automated coding agents — keep diffs minimal, safe, and repo-aligned.

## Source-of-Truth Routing

Use this routing model for every change:

- Implementation contracts (canonical): `docs/spec/**`
- Non-spec guidance: `docs/guidelines/**`
- Visual language source: `DESIGN.md`
- Admin design implementation guide: `docs/guidelines/frontend-design.md`

## Repo Map

- Monorepo: Turborepo + pnpm workspace
- Backend API: `apps/api`
- Admin frontend: `apps/admin`
- Platform Console frontend: `apps/platform`
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

## Stage Validation

Validate in proportion to the change and its milestone; do not run a package or
repository-wide gate after every small edit.

- During an isolated change, run the closest relevant static check and focused
  test. Re-run only the checks invalidated by subsequent edits.
- At a coherent milestone or before handoff, run the affected package gate:
  `pnpm api:check` for API work, `pnpm admin:check` for Admin work, or
  `pnpm platform:check` for Platform work.
- Run `pnpm check` for cross-app integration or final delivery when its scope
  justifies a repository-wide gate.
- For a focused backend test, use the package script, for example
  `pnpm -C apps/api test tests/path/to_test.py::test_name`, and start with a
  60-second timeout as a diagnostic default, not a hard gate. Give
  integration, database, or inherently slow tests the time needed to complete
  and expose their result.
- Pass focused Admin Vitest paths directly, for example
  `pnpm --filter @arclayer/admin test test/components/layout/route-progress.test.tsx`.
  Use the same direct-path form for Platform. Do not insert an extra `--`
  before the path or depend on separator behavior across pnpm and Vitest; it
  can defeat the intended file filter and trigger a broader run.

## Guidelines Directory Policy

`docs/guidelines/**` stores non-spec guidance only.

- Keep: `agents-guide.md`, `code-review-engine.md`, `frontend-design.md`
- Pending migration material: `images-api.md`, `search-integration.md`
- Do not route implementation contracts from `docs/guidelines/**`

## Frontend Execution Contract

- Active frontend scope: `apps/admin`, `apps/platform`, and application-facing surfaces in `packages/ui`
- `DESIGN.md` is the primary visual language source
- For design-sensitive changes, align with `docs/guidelines/frontend-design.md`
- Reuse `@arclayer/ui` first; install missing generic primitives through the configured shadcn Registry instead of hand-building substitutes
- Use `lucide-react` for icons and `@arclayer/ui/chart` (Recharts) for charts; do not add competing icon or chart stacks
- Keep page-local loading, error, and empty states explicit
- All new product copy must use stable i18n keys with both `zh-CN` and `en-US` resources
- Treat `docs/spec/admin/frontend/product-ui-toolchain.md` as the canonical UI toolchain contract

## Repo Intelligence Workflow

For medium+ tasks, architecture questions, or multi-file refactors:

1. `GitNexus` for discovery and impact
2. `code-review-engine` changed audit for repository-rule review context
3. `serena` for symbol-level precision

Prefer live repo truth if indexes are stale or unavailable.

## Safety Baseline

- No silent fallbacks or mock-success paths.
- Keep one canonical contract surface after hard-cut changes.
- Remove superseded shims/facades in the same rollout unless explicitly approved.
- Do not touch lockfiles, caches, build outputs, or `node_modules/` unless the task requires it.

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **Arclayer** (99333 symbols, 158082 relationships, 300 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> If any GitNexus tool warns the index is stale, run `npx gitnexus analyze` in terminal first.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `gitnexus_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `gitnexus_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `gitnexus_context({name: "symbolName"})`.

## Never Do

- NEVER edit a function, class, or method without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `gitnexus_rename` which understands the call graph.
- NEVER commit changes without running `gitnexus_detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/Arclayer/context` | Codebase overview, check index freshness |
| `gitnexus://repo/Arclayer/clusters` | All functional areas |
| `gitnexus://repo/Arclayer/processes` | All execution flows |
| `gitnexus://repo/Arclayer/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
