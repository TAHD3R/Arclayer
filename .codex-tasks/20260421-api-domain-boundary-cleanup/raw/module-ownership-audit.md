# API Module Ownership Audit

Date: 2026-04-21
Epic: `20260421-api-domain-boundary-cleanup`

## Truth Snapshot

- `organization/*` and most `workspaces/*` are governance-plane modules.
- `projects/*` is the new product-facing management boundary for project-owned capabilities.
- `sites/*` still carries most deliverable backend implementation and public runtime/delivery surfaces.
- `projects/facade/*` is now limited to project authz/settings/site preview bridge responsibilities after API keys/releases/publish moved into their own project routers.
- `projects/content/*/internal_router.py` no longer carries workspace-content operation names or workspace content tags, but it still exposes internal project-content bridge routes that resolve workspace/site backing IDs.
- deleted extension platform and workspace themes are gone from live API module trees, while generated OpenAPI/Admin/Test contracts still retain stale surfaces.

## Ownership Decisions

### Keep

- `apps/api/src/modules/organization/workspaces`
  - Workspace lifecycle inside organization governance remains valid.
- `apps/api/src/modules/workspaces/team`
  - Member, invite, and team governance belongs to workspace.
- `apps/api/src/modules/workspaces/settings`
  - Workspace governance settings and role policy belong to workspace.
- `apps/api/src/modules/workspaces/authz`
  - Workspace authz snapshot is governance-plane infrastructure.
- `apps/api/src/modules/workspaces/rbac`
  - Workspace RBAC remains a valid governance boundary.
- `apps/api/src/modules/workspaces/service`
  - Workspace metadata plus primary-project projection matches the current product model.
- `apps/api/src/modules/projects/domains`
  - Project-facing domain contract is the right public surface.
- `apps/api/src/modules/projects/runtime`
  - Runtime identity belongs under project/runtime. Runtime read paths now fail on missing project-runtime site bridge; project creation provisions the primary bridge explicitly.
- `apps/api/src/modules/projects/content`
  - Project-facing content contract is the right public surface.
- `apps/api/src/modules/projects/publish`
  - Project-facing publish contract is the right public surface.
- `apps/api/src/modules/projects/releases`
  - Project-facing release contract is the right public surface.
- `apps/api/src/modules/projects/automation`
  - Project-facing automation contract is the right public surface.
- `apps/api/src/modules/workspaces/api_keys/router.py`
  - This file currently serves `/me/api-keys`, which is account-level personal key management.
- `apps/api/src/modules/system/settings`
  - Platform namespace settings remain valid. Theme/plugin namespace belongs here.
- `apps/api/src/modules/system/rbac`
  - Platform RBAC and plugin-aware permissions remain valid internal infrastructure.

### Rename

- `apps/api/src/modules/projects/facade`
  - Real responsibility: project site/settings/authz bridge into workspace/site/runtime backing services.
  - Recommended target name: `projects/bridge` or `projects/legacy_bridge`.
- Generated/client symbols still carrying `Workspace*` names for project-owned APIs
  - Priority examples:
    - generated `WorkspaceApiKeyCreateIn` for `/projects/{project_id}/api-keys`
    - generated workspace publish/release/theme/extension operations that no longer match live backend source ownership

### Move

- `apps/api/src/modules/sites/delivery`
  - Public delivery APIs still expose site-owned runtime identity.
- `apps/api/src/modules/sites/runtime`
  - Public runtime APIs still expose site-owned runtime identity.
- `apps/api/src/modules/sites/public`
  - Host resolution and public context still bind directly to site identity.
- `apps/api/src/modules/sites/publishing`
  - Publishing pipeline still lives under `sites`.
- `apps/api/src/modules/sites/graphql`
  - GraphQL runtime still lives under `sites`.
- `apps/api/src/modules/sites/domains`
  - Internal workspace-site domain bridge still advertises old ownership.
- `apps/api/src/modules/sites/design`
  - Design/layout/node editing still lives under `sites`.
- `apps/api/src/modules/sites/patterns`
- `apps/api/src/modules/sites/stores`
- `apps/api/src/modules/sites/routing`
- `apps/api/src/modules/sites/shared`
- `apps/api/src/modules/sites/content`
  - These remain deliverable backend building blocks and still live under the old `sites` domain.

### Delete

- `apps/api/src/modules/projects/content/*/internal_router.py`
  - These files now expose project-content internal bridge routes and should be deleted after project public routers stop reusing their shared handlers/helpers.
- Generated and client contract remnants for deleted surfaces
  - extension platform
  - workspace themes
  - workspace api-keys
  - workspace automation
  - workspace releases
  - stale project themes

## Root-Cause Findings

### 1. Bridge Layer Drift

- `projects/facade/router.py` still maps project site/settings/authz concerns into workspace/site-oriented services.
- Project API keys, publish, and releases now live in dedicated `projects/*` routers instead of the facade.

### 2. Site Domain Still Owns Deliverable Backend

- `sites/*` remains the main home for runtime, delivery, publishing, GraphQL, and host-resolution logic.
- This means the product contract says `Project -> Site/Publishing`, while implementation still says `Site owns public runtime`.

### 3. Internal Workspace Contract Still Runs in Parallel

- `projects/content/*/internal_router.py` now uses project-content tags and operation names.
- These routes still preserve workspace/site dual-key backing assumptions while the data model remains workspace/site keyed.

### 4. Generated Contract Drift

- `packages/openapi/src/generated/*`
- `packages/openapi/openapi.json`
- `packages/openapi/src/admin-types.ts`
- selected Admin tests under `apps/admin/test/pages/workspaces/content/**`

These files still publish deleted or migrated surfaces long after the live backend module tree changed.

## Evidence Hotspots

- `apps/api/src/modules/projects/facade/router.py`
- `apps/api/src/modules/projects/runtime/service.py`
- `apps/api/src/modules/projects/content/items/internal_router.py`
- `apps/api/src/modules/projects/publish/internal_router.py`
- `apps/api/src/modules/projects/releases/internal_router.py`
- `apps/api/src/modules/sites/delivery/router.py`
- `apps/api/src/modules/sites/runtime/router.py`
- `apps/api/src/modules/sites/public/router.py`
- `apps/api/src/modules/sites/graphql/router.py`
- `packages/openapi/src/generated/sdk.gen.ts`
- `packages/openapi/openapi.json`
- `apps/admin/test/lib/workspace-nav-regression.test.ts`

## Execution Order

1. Stabilize imports and route wiring after the project/workspace cutover.
2. Replace direct bridge dependencies that still point from project routes back into workspace router helpers.
3. Rename project-owned services and schemas away from `Workspace*` names.
4. Regenerate OpenAPI and clean Admin/Test contract drift.
5. Move remaining deliverable implementation from `sites/*` toward runtime-owned modules.
6. Cut project content internal bridge routers after public routers stop sharing internal handler helpers.

## 2026-04-21 Source Recheck

- `apps/api/src/modules/workspaces/content`, `workspaces/publish`, `workspaces/releases`, and `workspaces/automation` now have no source files and the leftover `__pycache__` directories were removed.
- `apps/api/src/modules/extensions`, `apps/api/src/modules/workspaces/extensions`, `apps/api/src/modules/organization/extensions`, `apps/api/src/modules/workspaces/themes`, and `apps/api/src/modules/projects/themes` are absent from live API source.
- `rg` over `apps/api/src/modules` and `apps/api/src/models` shows no `WorkspaceContent*`, no `workspace_content_` helpers, and no `domain.workspaces.content/publish/releases` tags.
- Remaining `extensions` source hits are valid non-platform usages: GraphQL error `extensions`, SSO comment wording, and content model field description text in tests.
- Main remaining architectural debt is `sites/*` as the public runtime/delivery/publishing/GraphQL implementation home plus generated OpenAPI/Admin/Test contract drift.
