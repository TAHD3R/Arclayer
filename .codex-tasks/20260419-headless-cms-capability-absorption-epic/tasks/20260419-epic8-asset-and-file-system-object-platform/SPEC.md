# Task Specification

## Task Shape

- **Shape**: `single-full`

## Goals

- 把资产能力推进成 file platform，并同步落地 assets management surface 与 editor asset pickers。

## Non-Goals
- workflow stages
- automation builder
- diagnostics center


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
- asset system object contracts
- file lifecycle
- asset query and SDK surface
- assets management surface


## Done-When

- [ ] Child task truth files are present and internally consistent
- [ ] `TODO.csv` covers the epic with leaf-level execution steps
- [ ] `PROGRESS.md` contains a valid recovery block
- [ ] The docs index links this child task and its checklist path

## Final Validation Command

```bash
pnpm admin:check && timeout 60s env RUN_INTEGRATION_TESTS=1 pnpm -C apps/api uv -- pytest -q tests/modules/assets tests/modules/sites
```

## Demo Flow (optional)

1. Open `.codex-tasks/20260419-headless-cms-capability-absorption-epic/tasks/20260419-epic8-asset-and-file-system-object-platform/SPEC.md`
2. Open `.codex-tasks/20260419-headless-cms-capability-absorption-epic/tasks/20260419-epic8-asset-and-file-system-object-platform/TODO.csv`
3. Resume from `.codex-tasks/20260419-headless-cms-capability-absorption-epic/tasks/20260419-epic8-asset-and-file-system-object-platform/PROGRESS.md`
