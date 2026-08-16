# Monorepo Workspace Commands

This code-spec defines command ownership for pnpm workspaces and Turborepo in Arclayer.

## Scenario: Running and Changing Workspace Commands

### 1. Scope / Trigger

- Trigger: adding, changing, or running root/package scripts, Turborepo tasks, workspace package membership, generated-client commands, database commands, or quality gates.
- Applies to root `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `apps/*/package.json`, `packages/*/package.json`, and `scripts/*/package.json`.

### 2. Signatures

- Package manager: `pnpm@11.9.0`
- Workspace manifest: `pnpm-workspace.yaml`
- Task runner config: `turbo.json`
- Root checks:
  - `pnpm check`
  - `pnpm app:check`
  - `pnpm platform:check`
  - `pnpm api:check`
  - `pnpm cli:check`
- Filtered command shape: `pnpm --filter <package> <script>`
- Directory command shape: `pnpm -C <dir> <script>`
- OpenAPI generation: `pnpm --filter @arclayer/openapi generate`
- API migrations:
  - `pnpm --filter @arclayer/api db:migrate`
  - `pnpm --filter @arclayer/api db:upgrade`

### 3. Contracts

- Use pnpm only. Do not introduce npm, yarn, bun, or direct package-manager lockfiles.
- Run project tooling through package scripts: `pnpm <script>`, `pnpm --filter <pkg> <script>`, or `pnpm -C <dir> <script>`.
- Do not bypass package scripts by directly calling `.venv/bin/*`, local binary paths, or ad hoc tool commands when an existing script covers the task.
- Root scripts define user-facing task names. Package scripts define package-local execution. Turborepo orchestrates dependency order, caching, persistent tasks, and pass-through environment.
- `turbo.json` tasks with `"persistent": true` are runtime/dev processes. Do not run persistent dev/worker/scheduler tasks in automation unless the user asks for runtime verification.
- Database migration tasks are interactive and generated. Schema changes start from Tortoise model/source state, then migration files are generated through the package script and reviewed.
- `pnpm-workspace.yaml` owns workspace inclusion. New packages must be covered by its globs and must expose package scripts that fit root/Turbo orchestration when they participate in shared checks.
- Root command changes must be reflected in this spec and in task evidence when they alter validation expectations.

### 4. Validation & Error Matrix

| Condition                                        | Required behavior                                                                                                                          |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Small Product Application-only iteration                       | Run the closest static check and focused test; run `pnpm app:check` at a coherent milestone or before handoff                            |
| Small Platform-only iteration                    | Run the closest static check and focused test; run `pnpm platform:check` at a coherent milestone or before handoff                         |
| Small API-only iteration                         | Run the closest static check and focused test; run `pnpm api:check` at a coherent milestone or before handoff                              |
| Change crosses the Product Application, Platform, or API | Run affected package checks; run `pnpm check` for cross-app integration or final delivery                                                  |
| Change affects `packages/openapi` generation     | Run/regenerate through `pnpm --filter @arclayer/openapi generate`                                                                          |
| Need focused package script                      | Use `pnpm --filter <package> <script>` or `pnpm -C <dir> <script>`; pass focused test paths directly without an extra `--` before the path |
| Need backend ad hoc Python command               | Use `pnpm -C apps/api uv -- <command>`                                                                                                     |
| Need migration generation/application            | Use `pnpm --filter @arclayer/api db:migrate` / `db:upgrade`; do not hand-edit migration files                                              |
| Command would start persistent infra/dev process | Run only when runtime verification is requested and report the URL/process scope                                                           |
| New root or package script is added              | Wire it through Turborepo only when it is part of shared orchestration                                                                     |

### 5. Good/Base/Bad Cases

- Good: a Product Application component change runs the closest static check and focused test while it is edited, then `pnpm app:check` at the next coherent milestone.
- Good: a backend schema/API change runs focused backend checks and regenerates OpenAPI while it is edited, then runs `pnpm api:check` and the affected frontend check at the appropriate milestone.
- Good: an OpenAPI client refresh uses `pnpm --filter @arclayer/openapi generate`.
- Base: a narrow API unit investigation uses `pnpm -C apps/api uv -- pytest <node>` with a 60-second initial diagnostic budget, extending integration, database, or inherently slow runs until the actual result is visible.
- Good: a focused Product Application Vitest file uses `pnpm --filter @arclayer/app test test/components/layout/route-progress.test.tsx`. Pass the path directly without an extra `--`; separator behavior across pnpm and Vitest can defeat the intended file filter and broaden the run.
- Bad: running `.venv/bin/pytest` directly from `apps/api`.
- Bad: changing `turbo.json` to make a broken task pass without fixing the failing package script.
- Bad: hand-editing generated migration or OpenAPI output to satisfy a local test.

### 6. Tests Required

- Script changes require executing the changed script or the narrowest root command that exercises it.
- Turborepo task changes require verifying the affected task dependency/caching behavior with the relevant `pnpm` script.
- Workspace membership changes require verifying `pnpm --filter <package> <script>` resolves the intended package.
- Generated-command changes require checking that generated output is produced from source inputs and reviewing the generated diff.

### 7. Wrong vs Correct

#### Wrong

```bash
.venv/bin/pytest tests/modules/workspaces/test_members.py
```

#### Correct

```bash
pnpm -C apps/api uv -- pytest tests/modules/workspaces/test_members.py
```

Backend tooling goes through package scripts or `pnpm -C apps/api uv -- ...` so environment behavior stays consistent.
