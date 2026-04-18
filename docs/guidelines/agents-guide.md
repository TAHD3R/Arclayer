# Agents Guide (Arclayer)

This document defines behavioral rules for automated coding agents working in this repository.

It is complementary to `AGENTS.md`:
- `AGENTS.md` focuses on repo navigation and fast operational rules.
- This guideline defines longer-lived agent behavior and communication constraints.

## 1. Priorities

1. Correctness and safety
2. Minimal scope and reviewable diffs
3. Alignment with existing architecture and conventions
4. Clear failures (no silent fallbacks)

## 2. Language & Communication

- Default user-facing replies to Chinese unless the user explicitly requests another language.
- When the user requests a commit message, write it in English (prefer Conventional Commits).
- Do not end the final answer with follow-up tasks or “nice-to-have” enhancements.

## 3. Scope Discipline

- Do exactly what the user asked; avoid opportunistic refactors.
- Fix root causes, but keep diffs minimal and localized.
- Do not change public contracts/behavior without updating the relevant guideline and tests.

## 4. Debug-First (No Silent Fallbacks)

- Do not introduce mock/simulated “success” paths to make things appear fixed.
- Do not swallow errors or hide failing validations.
- Prefer explicit failures with actionable context (errors, logs, failing tests).

## 5. Do Not Touch (Unless Explicitly Requested)

- `node_modules/`
- lockfiles (e.g. `pnpm-lock.yaml`, `uv.lock`)
- local env and caches (e.g. `.venv/`, `.uv-cache/`)
- build outputs / generated artifacts (e.g. `dist/`, `build/`, `.turbo/`)

## 6. Command Discipline (Monorepo)

This repo uses Turborepo + pnpm workspaces. Commands must go through `package.json` scripts.

- Use `pnpm <script>`, `pnpm --filter <pkg> <script>`, or `pnpm -C <dir> <script>`.
- Do not run `.venv/bin/*` directly (e.g. `.venv/bin/pytest`, `.venv/bin/ty`).
- Backend ad-hoc commands must go through scripts, e.g. `pnpm -C apps/api uv -- <command>`.

Avoid running infra / interactive commands unless the user explicitly asks:
- `pnpm infra:*` (starts `docker compose`)
- `turbo run db:migrate` / `turbo run db:upgrade` (interactive tasks)

### Backend Migration Workflow

- Handle API schema changes through:
  - `pnpm --filter @arclayer/api db:migrate`
  - `pnpm --filter @arclayer/api db:upgrade`
- Keep migration files command-generated.
- Review generated migrations before applying them.
- Resolve migration drift by auditing models and existing migrations, then regenerating through the commands above.
- Do not hand-write or hand-edit migration file contents.

## 7. Cross-References (Source of Truth)

- Guidelines index: `docs/guidelines/README.md`
- API contract: `docs/guidelines/backend-endpoint-contract.md`
- Backend folder architecture: `docs/guidelines/backend-folder-architecture.md`
- Frontend folder architecture: `docs/guidelines/frontend-folder-architecture.md`
- UI design guideline (Admin): `docs/guidelines/frontend-design.md`
- i18n: `docs/guidelines/i18n.md`
- Testing & quality gates: `docs/guidelines/testing-and-quality-gates.md`
