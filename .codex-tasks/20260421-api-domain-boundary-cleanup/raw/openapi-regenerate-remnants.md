# OpenAPI Regenerate Remnants

Date: 2026-04-21
Epic: `20260421-api-domain-boundary-cleanup`

## Scope

This note now records the regenerate result after OpenAPI export and SDK generation from live backend truth.

## Regenerate Result

- `pnpm --filter @arclayer/openapi generate` passed
- `pnpm --filter @arclayer/openapi typecheck` passed
- `pnpm --filter @arclayer/management-sdk typecheck` passed
- `pnpm --filter @arclayer/management-sdk test` passed

## Cleared Contract Drift

### 1) Deleted workspace themes surface

- cleared from generated OpenAPI/SDK outputs
- cleared from admin typed surface

### 2) Deleted extension platform surface

- cleared from generated OpenAPI/SDK outputs
- cleared from admin typed surface

### 3) Project API key contract

- project-facing contract now uses project-owned admin/openapi surface
- temporary aliasing shim in `packages/openapi/src/index.ts` was removed

### 4) Project deliverable SDK surface

- management SDK project content, releases, publish, automation, and API keys now use project-facing parameter names and generated project operations

## Remaining Drift After Regenerate

- internal bridge paths still expose workspace identity in live backend source:
  - `/_internal/workspaces/{workspace_id}/publish`
  - `/_internal/workspaces/{workspace_id}/releases`
- this is source-level bridge debt, not generated contract drift

## Admin Follow-up

- project-content admin drift caused by `workspaceId -> projectId` cutover was cleaned in targeted pages/tests
- `pnpm admin:check` remains blocked by unrelated existing admin baseline typecheck/test failures and Vitest OOM
