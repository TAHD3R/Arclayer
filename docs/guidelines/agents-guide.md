# Agents Guide (Arclayer)

This document defines long-lived behavior guidance for coding agents.
It is **not** the implementation contract source.

## Source Routing

- Implementation contracts: `docs/spec/**` (canonical).
- Trellis runtime mirror: `.trellis/spec/**` (generated from `docs/spec/**`).
- Non-spec guidance: `docs/guidelines/**`.
- Visual language: `DESIGN.md` (primary) plus `docs/guidelines/frontend-design.md`.

## Behavior Priorities

1. Correctness and safety first.
2. Minimal, reviewable diffs.
3. Clear failures over silent fallback behavior.
4. Respect existing architecture boundaries.

## Communication

- Default user-facing replies in Chinese unless the user requests another language.
- Use English when writing commit messages.
- Do not end final responses with optional follow-up enhancements.

## Execution Discipline

- Use repo scripts (`pnpm <script>`, `pnpm --filter`, `pnpm -C`).
- Do not run `.venv/bin/*` directly.
- Do not hand-edit generated artifacts.

## Hard-Cut Cleanup

When replacing a contract surface, remove superseded shims, facades, and dual-track paths in the same rollout unless the user explicitly approves a temporary compatibility path.

## Repository Hygiene

Do not change these unless explicitly required by the task:

- `node_modules/`
- lockfiles (`pnpm-lock.yaml`, `uv.lock`)
- local caches/env (`.venv/`, `.uv-cache/`)
- build outputs (`dist/`, `build/`, `.turbo/`)
