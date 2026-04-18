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
- Portal frontend: `apps/portal` (Vike + React).
- Studio: `apps/studio`.
- Shared packages: `packages/*`.
- Plugins: `plugins/*`.
- Standards & rules (source of truth): `docs/guidelines/*` (see index below).

## Stack & Runtimes

- Package manager: pnpm only (`packageManager` is pinned in root `package.json`).
- Task runner: Turborepo (outputs are defined in `turbo.json`, commonly `dist/**`, `build/**`).
- Backend: FastAPI (async-first) + Pydantic v2.
- Frontend:
  - Admin/Studio: Vite + React.
  - Portal: Vike + React (custom Node server entry).
  - Styling/i18n: follow the design guideline and i18n guideline.

## Repo-Local Frontend Skill

- This repo provides a repo-local skill at `.agents/skills/arclayer-frontend-design`.
- Use it for any frontend task that changes UI direction, page hierarchy, panel structure, theming, tokens, spacing, typography, interaction styling, or user-facing copy.
- Default trigger areas:
  - `apps/admin`
  - `apps/portal`
  - `apps/studio`
  - `packages/ui`
  - design-sensitive frontend docs and stories
- Treat this skill as mandatory for:
  - new pages, layouts, dialogs, command surfaces, settings surfaces, tables, forms, and empty states
  - copywriting for labels, descriptions, onboarding text, helper text, error text, and CTA text
  - design-sensitive refactors where there is a risk of card nesting, decorative surfaces, or engineering-flavored product copy
- Pair it with `karpathy-guidelines` by default. Pair it with generic frontend skills such as `shadcn`, `tailwind-design-system`, `vercel-composition-patterns`, or `vercel-react-best-practices` only for implementation mechanics.
- The repo-local skill sets direction and copy guardrails. Generic frontend skills must not override it on visual hierarchy or product-writing decisions.

## Repo-Local General Skills

- This repo also carries repo-local copies of general engineering skills under `.agents/skills/`.
- Treat these repo-local copies as the preferred project baseline when they overlap with globally installed skills.
- The current repo-local general skill set covers:
  - backend and API design: `api-and-interface-design`, `api-design-principles`, `fastapi-python`, `pydantic`
  - testing and verification: `python-testing-patterns`, `test-driven-development`, `verification-before-completion`
  - debugging and review: `systematic-debugging`, `code-review-and-quality`, `security-and-hardening`
  - frontend engineering and design-system mechanics: `frontend-ui-engineering`, `tailwind-design-system`
  - platform and repo operations: `ci-cd-and-automation`, `monorepo-management`, `turborepo`
- Use the repo-local frontend skill for visual direction and product-writing rules. Use the repo-local general skills for implementation mechanics, testing, debugging, and delivery discipline.

## Agent Priorities

- Correctness first: minimal scope, targeted edits, keep diffs reviewable.
- Respect boundaries:
  - Backend layering: router/service/repository/schema.
  - App boundaries: do not copy/paste cross-app logic; prefer `packages/*` when sharing is needed.
- Prefer existing patterns and abstractions; avoid introducing new frameworks or ad-hoc conventions.
- Never hide failures: no silent fallbacks, no swallowing exceptions, no fake “success” paths.

## Repo MCP Workflow

- This repository uses a three-layer code-intelligence workflow:
  - `GitNexus` for repo-wide exploration, graph search, architecture discovery, cross-boundary process tracing, and multi-repo reference work
  - `code-review-graph` for change review, impact analysis, risk scoring, and review-focused context
  - `serena` for symbol-level navigation, reference tracing, and precise semantic lookup
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
  - run `gitnexus analyze . --skip-agents-md` from repo root when the repo is not indexed or the index is stale
  - run `gitnexus status` to verify freshness before relying on it
  - keep `.gitnexus/` local and uncommitted
- `GitNexus` is the preferred tool when working with local reference repositories such as `references/*`, or when comparing Arclayer against other codebases.
- If `code-review-graph` is empty or stale, refresh it before relying on results:
  - `code-review-graph status --repo /home/philip/Arclayer`
  - `code-review-graph update --repo /home/philip/Arclayer`
  - use full `code-review-graph build --repo /home/philip/Arclayer --skip-flows` when needed
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

Keep migration files command-generated and review the generated artifact before upgrade.

Avoid running infra / interactive commands unless the user asks:

- `pnpm infra:*` (starts `docker compose`)
- `turbo run db:migrate` / `turbo run db:upgrade` (interactive tasks)

## Validation (Fast Path)

Prefer the narrowest check that matches your change:

- API-only changes: `pnpm api:check` (lint + format + typecheck + test)
- Admin-only changes: `pnpm admin:check`
- Portal-only changes: `pnpm portal:check`
- Cross-app changes: `pnpm check`

Use `pnpm format` only when formatting is required by the task.

## Where to Put Detailed Rules (Source of Truth)

`AGENTS.md` is for agent behavior and repo navigation. Detailed engineering constraints live under `docs/guidelines/`:

- Index: `docs/guidelines/README.md`
- Agents behavior: `docs/guidelines/agents-guide.md`
- API contract: `docs/guidelines/backend-endpoint-contract.md`
- Backend folder architecture: `docs/guidelines/backend-folder-architecture.md`
- Frontend folder architecture: `docs/guidelines/frontend-folder-architecture.md`
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

- Third-party reference repositories belong under `/home/philip/Arclayer/references/`.
- `/references` is gitignored. Keep reference repos there so they never enter Arclayer commits by accident.
- Use reference repos for architecture comparison, implementation benchmarking, and protocol study. Do not copy code blindly across boundaries.
