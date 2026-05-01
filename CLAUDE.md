# Arclayer Agents Guide

Actionable rules for automated repo agents — keep diffs minimal, safe, and repo-aligned.

Longer-lived agent behavior rules: `docs/guidelines/agents-guide.md`.

## Purpose & Scope

- Audience: automated coding agents working in this repository.
- Goal: small, correct diffs aligned with the project architecture and conventions.
- Non-goals (do not edit unless the user explicitly asks):
  - `node_modules/`
  - local env / caches (e.g. `.venv/`, `.uv-cache/`)
  - lockfiles (e.g. `pnpm-lock.yaml`, `uv.lock`)
  - build outputs / generated artifacts (e.g. `dist/`, `build/`, `.turbo/`)

## Repo Map

- Monorepo managed by Turborepo + pnpm workspaces: `package.json`, `pnpm-workspace.yaml`, `turbo.json`.
- Backend API: `apps/api` (FastAPI + Pydantic v2).
- Admin frontend: `apps/admin` (Vite + React).
- Shared packages: `packages/*`.
- Plugins: `plugins/*`.
- Standards & rules (source of truth): `docs/guidelines/*` (see index below).

## Stack & Runtimes

- Package manager: pnpm only (`packageManager` is pinned in root `package.json`).
- Task runner: Turborepo (outputs are defined in `turbo.json`, commonly `dist/**`, `build/**`).
- Backend: FastAPI (async-first) + Pydantic v2.
- Frontend:
  - Admin: Vite + React.
  - Styling: follow `DESIGN.md` first, then `docs/guidelines/frontend-design.md`.
  - i18n: follow the i18n guideline.

## Frontend Execution Contract

- Active frontend scope: `apps/admin` and Admin-facing surfaces from `packages/ui`.
- `DESIGN.md` is the primary source of truth for visual language: canvas, color roles, typography, spacing, radius, borders, elevation, motion, states, and UX writing.
- For any task that changes UI direction, page hierarchy, panel structure, theming, tokens, spacing, typography, interaction styling, or user-facing copy, read `DESIGN.md`, `docs/guidelines/frontend-design.md`, and `.agents/skills/frontend-ui-engineering/SKILL.md` before editing.
- Use `docs/guidelines/frontend-design.md` for Admin implementation rules: page shells, overlays, component defaults, data tables, settings surfaces, semantic typography classes, and PR checks.
- Use `.agents/skills/tailwind-design-system/SKILL.md` for Tailwind and token mechanics when the task needs design-system implementation detail.
- Use `.agents/skills/arclayer-playwright-skills/SKILL.md` whenever the user asks to call Playwright MCP, interactively test Admin UI, reproduce a frontend regression in browser, inspect console or network failures, verify responsive and visual behavior, log in or register the default test account, or use a user-provided Bearer Token for Admin testing.
- Before changing UI, cite the relevant `DESIGN.md` rules in working notes, inspect the target file and nearby implemented surfaces, then identify the shell primitive, state coverage, token usage, responsive behavior, and copy style that the change must preserve.
- New pages, layouts, dialogs, command surfaces, settings surfaces, tables, forms, empty states, and copy changes must follow the `DESIGN.md` visual language and the shared Admin vocabulary in `docs/guidelines/frontend-design.md`.
- Design-sensitive UI work requires visual verification with Playwright or screenshots when a runtime is available, with explicit readback against `DESIGN.md` rules. When runtime verification is blocked, report the blocker and run the narrowest static checks that still cover the changed files.
- Generic frontend skills and examples are implementation references only. Repo guidelines and live Admin surfaces control visual hierarchy, product copy, and interaction decisions.

## Repo-Local General Skills

- This repo also carries repo-local copies of general engineering skills under `.agents/skills/`.
- Treat these repo-local copies as the preferred project baseline when they overlap with globally installed skills.
- The current repo-local general skill set covers:
  - backend and API design: `api-and-interface-design`, `api-design-principles`, `fastapi-python`, `pydantic`
  - testing and verification: `python-testing-patterns`, `test-driven-development`, `verification-before-completion`
  - debugging and review: `systematic-debugging`, `code-review-and-quality`, `security-and-hardening`
  - frontend engineering and design-system mechanics: `frontend-ui-engineering`, `tailwind-design-system`
  - platform and repo operations: `ci-cd-and-automation`, `monorepo-management`, `turborepo`
- Use the frontend execution contract for visual direction and product-writing rules. Use the repo-local general skills for implementation mechanics, testing, debugging, and delivery discipline.

## Agent Priorities

- Correctness first: minimal scope, targeted edits, keep diffs reviewable.
- Respect boundaries:
  - Backend layering: router/service/repository/schema.
  - App boundaries: do not copy/paste cross-app logic; prefer `packages/*` when sharing is needed.
- Hard-cut work keeps one canonical contract surface and removes superseded thin facade, shim, forwarding layer, and dual-track compatibility path in the same rollout.
- Any thin facade, shim, or dual-track compatibility path left for later cleanup requires explicit user approval with rationale and removal plan.
- Prefer existing patterns and abstractions; avoid introducing new frameworks or ad-hoc conventions.
- Never hide failures: no silent fallbacks, no swallowing exceptions, no fake “success” paths.

## Repo MCP Workflow

- This repository uses a three-layer code-intelligence workflow:
  - `GitNexus` for repo-wide exploration, graph search, architecture discovery, cross-boundary process tracing, and multi-repo reference work
  - `code-review-graph` for change review, impact analysis, risk scoring, and review-focused context
  - `serena` for symbol-level navigation, reference tracing, and precise semantic lookup
- Resolve the active repository root before using repo-intelligence tools:
  - run `git rev-parse --show-toplevel` from the current working directory
  - treat the returned absolute path as `<ACTIVE_REPO_ROOT>`
  - compare MCP repository paths against `<ACTIVE_REPO_ROOT>` before trusting indexed output
- MCP calls must target `<ACTIVE_REPO_ROOT>` explicitly when multiple repos, clones, forks, or worktrees are indexed:
  - GitNexus: pass `repo: "<ACTIVE_REPO_ROOT>"` or a registered repo entry whose `path` matches `<ACTIVE_REPO_ROOT>`.
  - code-review-graph: pass `repo_root: "<ACTIVE_REPO_ROOT>"` on graph build, update, review, impact, query, and refactor tools.
  - serena: activate `<ACTIVE_REPO_ROOT>` before symbol-level work.
- If a repo-intelligence tool returns another checkout path for the same project, analyze, register, build, or update `<ACTIVE_REPO_ROOT>` first. Use live repo reads until the tool output matches `<ACTIVE_REPO_ROOT>`.
- For medium-or-larger tasks, architecture work, root-cause analysis across multiple files, reference-repo comparison, or cross-file refactors, use this workflow before broad manual exploration.
- Default tool order:
  - start with `GitNexus` when the task is about understanding the codebase, discovering execution flows, comparing patterns, or exploring unfamiliar areas
  - use `code-review-graph` when the task is about reviewing changed files, estimating blast radius, validating a phase, or building review context
  - use `serena` when the relevant area is known and you need symbol-level precision for references, implementations, or targeted edits
- Default triggers for this workflow:
  - any request containing `review`
  - tasks touching 3 or more files
  - architecture and module-boundary questions
  - reference-repo comparison work under `references/**`
  - dependency / call-chain / blast-radius / flow questions
  - regressions that are not obviously isolated to one file
- Do not force these tools for trivial single-file edits where a direct file read is faster.
- `GitNexus` local workflow for this repo:
  - run `gitnexus analyze <ACTIVE_REPO_ROOT> --skip-agents-md` when the active repo is missing from the index or stale
  - run `gitnexus status` and verify that the indexed path matches `<ACTIVE_REPO_ROOT>` before relying on it
  - keep `.gitnexus/` local and uncommitted
- `GitNexus` is the preferred tool when working with local reference repositories such as `references/*`, or when comparing Arclayer against other codebases.
- Refresh `code-review-graph` for `<ACTIVE_REPO_ROOT>` before relying on results. Prefer an incremental update first and use a full rebuild when the graph is missing, stale, or structurally wrong:
  - MCP: `build_or_update_graph_tool({ repo_root: "<ACTIVE_REPO_ROOT>", full_rebuild: false })`
  - MCP full rebuild: `build_or_update_graph_tool({ repo_root: "<ACTIVE_REPO_ROOT>", full_rebuild: true })`
  - CLI status: `code-review-graph status --repo <ACTIVE_REPO_ROOT>`
  - CLI update: `code-review-graph update --repo <ACTIVE_REPO_ROOT>`
  - CLI full build: `code-review-graph build --repo <ACTIVE_REPO_ROOT> --skip-flows`
- If any of these tools are unavailable, stale, or return incomplete data, state that explicitly and continue from live repo truth rather than treating tool output as authoritative.

## Command Discipline (Monorepo)

Use repo scripts only:

- `pnpm <script>` (e.g. `pnpm check`, `pnpm dev`)
- `pnpm --filter <pkg> <script>`
- `pnpm -C <dir> <script>`

Do not:

- run `.venv/bin/*` directly (e.g. `.venv/bin/pytest`, `.venv/bin/ty`)
- bypass scripts by manually assembling env + direct tool invocation (except explicit debugging with rationale)
- start persistent dev servers in automation contexts unless the user asks

Backend ad-hoc commands must go through scripts, e.g. `pnpm -C apps/api uv -- <command>`.

For API schema migrations, use:

- `pnpm --filter @arclayer/api db:migrate`
- `pnpm --filter @arclayer/api db:upgrade`

Migration files are generated artifacts:

- Schema changes start in Tortoise model definitions.
- Generate migration files only with `pnpm --filter @arclayer/api db:migrate`.
- Apply migration files only with `pnpm --filter @arclayer/api db:upgrade`.
- Never hand-write, hand-repair, or hand-edit migration file contents.
- If generated output is wrong, fix the model/source-state issue, remove the generated artifact, and rerun `db:migrate`.
- Review the generated artifact before upgrade.

Avoid running infra / interactive commands unless the user asks:

- `pnpm infra:*` (starts `docker compose`)
- `turbo run db:migrate` / `turbo run db:upgrade` (interactive tasks)

## Validation (Fast Path)

Prefer the narrowest check that matches your change:

- API-only changes: `pnpm api:check` (lint + format + typecheck + test)
- Admin-only changes: `pnpm admin:check`
- Cross-app changes: `pnpm check`

Use `pnpm format` only when formatting is required by the task.

## Where to Put Detailed Rules (Source of Truth)

`AGENTS.md` is for agent behavior and repo navigation. Detailed engineering constraints live under `docs/guidelines/`:

- Index: `docs/guidelines/README.md`
- Agents behavior: `docs/guidelines/agents-guide.md`
- API contract: `docs/guidelines/backend-endpoint-contract.md`
- Backend folder architecture: `docs/guidelines/backend-folder-architecture.md`
- Frontend folder architecture: `docs/guidelines/frontend-folder-architecture.md`
- Visual language: `DESIGN.md`
- Design guideline: `docs/guidelines/frontend-design.md`
- i18n: `docs/guidelines/i18n.md`
- Testing & quality gates: `docs/guidelines/testing-and-quality-gates.md`

## Common Pitfalls (Quick Checks)

- i18n: avoid hardcoded user-facing strings; add keys to both `zh-CN` and `en-US` (see `docs/guidelines/i18n.md`).
- Backend: keep routers thin; do not call repositories from routers; external-facing IDs must use `PublicUUID` (see `docs/guidelines/backend-folder-architecture.md` and `docs/guidelines/backend-endpoint-contract.md`).
- Admin UI: follow convention tests (see `apps/admin/test/lib/conventions/admin-ui-conventions.test.ts`).
- Frontend: avoid `any`; keep routing config files free of business logic (see `docs/guidelines/frontend-folder-architecture.md`).
- Monorepo hygiene: avoid touching `node_modules/`, lockfiles, and build outputs unless explicitly required.

## Context Discipline (for Agents)

- Search narrowly with `rg`; open only files you need.
- Read small sections; avoid large/vendor directories (`node_modules`, build outputs, large assets).
- Keep edits minimal; avoid repo-wide formatting changes.

## Reference Repositories

- Third-party reference repositories belong under `<ACTIVE_REPO_ROOT>/references/`.
- `/references` is gitignored. Keep reference repos there so they never enter Arclayer commits by accident.
- Use reference repos for architecture comparison, implementation benchmarking, and protocol study. Do not copy code blindly across boundaries.

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **audit** (17235 symbols, 52790 relationships, 300 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> If any GitNexus tool warns the index is stale, run `npx gitnexus analyze` in terminal first.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `gitnexus_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `gitnexus_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `gitnexus_context({name: "symbolName"})`.

## When Debugging

1. `gitnexus_query({query: "<error or symptom>"})` — find execution flows related to the issue
2. `gitnexus_context({name: "<suspect function>"})` — see all callers, callees, and process participation
3. `READ gitnexus://repo/audit/process/{processName}` — trace the full execution flow step by step
4. For regressions: `gitnexus_detect_changes({scope: "compare", base_ref: "main"})` — see what your branch changed

## When Refactoring

- **Renaming**: MUST use `gitnexus_rename({symbol_name: "old", new_name: "new", dry_run: true})` first. Review the preview — graph edits are safe, text_search edits need manual review. Then run with `dry_run: false`.
- **Extracting/Splitting**: MUST run `gitnexus_context({name: "target"})` to see all incoming/outgoing refs, then `gitnexus_impact({target: "target", direction: "upstream"})` to find all external callers before moving code.
- After any refactor: run `gitnexus_detect_changes({scope: "all"})` to verify only expected files changed.

## Never Do

- NEVER edit a function, class, or method without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `gitnexus_rename` which understands the call graph.
- NEVER commit changes without running `gitnexus_detect_changes()` to check affected scope.

## Tools Quick Reference

| Tool | When to use | Command |
|------|-------------|---------|
| `query` | Find code by concept | `gitnexus_query({query: "auth validation"})` |
| `context` | 360-degree view of one symbol | `gitnexus_context({name: "validateUser"})` |
| `impact` | Blast radius before editing | `gitnexus_impact({target: "X", direction: "upstream"})` |
| `detect_changes` | Pre-commit scope check | `gitnexus_detect_changes({scope: "staged"})` |
| `rename` | Safe multi-file rename | `gitnexus_rename({symbol_name: "old", new_name: "new", dry_run: true})` |
| `cypher` | Custom graph queries | `gitnexus_cypher({query: "MATCH ..."})` |

## Impact Risk Levels

| Depth | Meaning | Action |
|-------|---------|--------|
| d=1 | WILL BREAK — direct callers/importers | MUST update these |
| d=2 | LIKELY AFFECTED — indirect deps | Should test |
| d=3 | MAY NEED TESTING — transitive | Test if critical path |

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/audit/context` | Codebase overview, check index freshness |
| `gitnexus://repo/audit/clusters` | All functional areas |
| `gitnexus://repo/audit/processes` | All execution flows |
| `gitnexus://repo/audit/process/{name}` | Step-by-step execution trace |

## Self-Check Before Finishing

Before completing any code modification task, verify:
1. `gitnexus_impact` was run for all modified symbols
2. No HIGH/CRITICAL risk warnings were ignored
3. `gitnexus_detect_changes()` confirms changes match expected scope
4. All d=1 (WILL BREAK) dependents were updated

## Keeping the Index Fresh

After committing code changes, the GitNexus index becomes stale. Re-run analyze to update it:

```bash
npx gitnexus analyze
```

If the index previously included embeddings, preserve them by adding `--embeddings`:

```bash
npx gitnexus analyze --embeddings
```

To check whether embeddings exist, inspect `.gitnexus/meta.json` — the `stats.embeddings` field shows the count (0 means no embeddings). **Running analyze without `--embeddings` will delete any previously generated embeddings.**

> Claude Code users: A PostToolUse hook handles this automatically after `git commit` and `git merge`.

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.agents/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.agents/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.agents/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.agents/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.agents/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.agents/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
<!-- TRELLIS:START -->
# Trellis Instructions

These instructions are for AI assistants working in this project.

This project is managed by Trellis. The working knowledge you need lives under `.trellis/`:

- `.trellis/workflow.md` — development phases, when to create tasks, skill routing
- `.trellis/spec/` — package- and layer-scoped coding guidelines (read before writing code in a given layer)
- `.trellis/workspace/` — per-developer journals and session traces
- `.trellis/tasks/` — active and archived tasks (PRDs, research, jsonl context)

If a Trellis command is available on your platform (e.g. `/trellis:finish-work`, `/trellis:continue`), prefer it over manual steps. Not every platform exposes every command.

If you're using Codex or another agent-capable tool, additional project-scoped helpers may live in:
- `.agents/skills/` — reusable Trellis skills
- `.codex/agents/` — optional custom subagents

Managed by Trellis. Edits outside this block are preserved; edits inside may be overwritten by a future `trellis update`.

<!-- TRELLIS:END -->
