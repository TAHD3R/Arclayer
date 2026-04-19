# Task Specification

## Task Shape

- **Shape**: `single-full`

## Goals

- 把两个 SDK 升级成 composable、schema-driven、realtime-ready 产品，并为 Admin 提供统一 client layer。

## Non-Goals
- assets backend lifecycle
- extensions marketplace UI
- operator diagnostics


## Constraints

- Follow `docs/plans/2026-04-19-headless-cms-capability-absorption-implementation-plan.md`
- Keep the child task aligned with its matching epic section in the implementation plan
- Do not collapse backend and frontend work into ambiguous checklist items
- Use explicit validation commands before any future `DONE` transition

## Environment

- **Project root**: `/home/philip/Arclayer`
- **Language/runtime**: Python / TypeScript / React / FastAPI
- **Package manager**: `pnpm`
- **Test framework**: `pytest` / `vitest`
- **Build command**: `pnpm check`
- **Existing test count**: repo-truth dependent

## Risk Assessment

- [ ] External dependencies (APIs, services) — availability confirmed?
- [ ] Breaking changes to existing code — impact assessed?
- [ ] Large file generation — disk space sufficient?
- [ ] Long-running tests — timeout configured?

## Deliverables
- shared SDK core
- schema-driven types
- realtime foundation
- frontend integration layer


## Done-When

- [ ] Child task truth files are present and internally consistent
- [ ] `TODO.csv` covers the epic with leaf-level execution steps
- [ ] `PROGRESS.md` contains a valid recovery block
- [ ] The docs index links this child task and its checklist path

## Final Validation Command

```bash
pnpm --filter @arclayer/management-sdk typecheck && pnpm --filter @arclayer/management-sdk test && pnpm --filter @arclayer/delivery-sdk typecheck && pnpm --filter @arclayer/delivery-sdk test
```

## Demo Flow (optional)

1. Open `.codex-tasks/20260419-headless-cms-capability-absorption-epic/tasks/20260419-epic9-sdk-productization-2/SPEC.md`
2. Open `.codex-tasks/20260419-headless-cms-capability-absorption-epic/tasks/20260419-epic9-sdk-productization-2/TODO.csv`
3. Resume from `.codex-tasks/20260419-headless-cms-capability-absorption-epic/tasks/20260419-epic9-sdk-productization-2/PROGRESS.md`
