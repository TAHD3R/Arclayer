# Task Specification

## Task Shape

- **Shape**: `single-full`

## Goals

- 固化平台对象词典、参考能力映射矩阵、验证基线，为后续所有 Headless CMS 平台增强 Epic 提供统一真值与恢复基础。

## Non-Goals
- 任何业务代码实现
- 修改现有 API 或 Admin 行为
- 引入新 runtime 依赖


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
- 平台对象词典与前端 surface 词典
- Strapi / Directus 能力映射矩阵
- focused backend/admin/editor 验证基线


## Done-When

- [ ] Child task truth files are present and internally consistent
- [ ] `TODO.csv` covers the epic with leaf-level execution steps
- [ ] `PROGRESS.md` contains a valid recovery block
- [ ] The docs index links this child task and its checklist path

## Final Validation Command

```bash
rg -n "平台对象|参考能力映射矩阵|focused checks" docs/plans/2026-04-19-headless-cms-capability-absorption-implementation-plan.md
```

## Demo Flow (optional)

1. Open `.codex-tasks/20260419-headless-cms-capability-absorption-epic/tasks/20260419-epic0-program-setup/SPEC.md`
2. Open `.codex-tasks/20260419-headless-cms-capability-absorption-epic/tasks/20260419-epic0-program-setup/TODO.csv`
3. Resume from `.codex-tasks/20260419-headless-cms-capability-absorption-epic/tasks/20260419-epic0-program-setup/PROGRESS.md`
