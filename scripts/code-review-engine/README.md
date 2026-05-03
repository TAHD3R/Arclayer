# Code Review Engine

Standalone monorepo consistency audit engine scaffold.

## Status

This project contains the Phase 1 skeleton from
`docs/plans/code-review-engine/implementation-plan.md`:

- standalone package under `scripts/code-review-engine`
- scope-aware CLI contract (`full/backend/frontend/module/package/changed/rules`)
- stable report models and JSON envelope
- initial rule metadata registry with scope filtering
- basic reporters (`json`, `human`, `markdown`)
- CLI and registry tests for skeleton behavior

Rule migration from `apps/api/src/core/audit` happens in later phases.

## Local usage

From repo root:

```bash
pnpm code-review-engine --help
pnpm code-review-engine --scope backend --format json
pnpm code-review-engine --scope module --module analytics --format human
```

Direct package commands:

```bash
pnpm -C scripts/code-review-engine cli --help
pnpm -C scripts/code-review-engine test
```
