# API Domain Boundary Cleanup Epic

## Goal

Hard-cut stale API module design so workspace remains the collaboration container, project owns deliverable website capabilities, site/runtime owns public publishing and delivery, and deleted extension/theme surfaces leave no active API contract behind.

## Current Findings

- `apps/api/src/modules/workspaces/router.py` still registers `workspace_extensions_router`.
- `apps/api/src/modules/workspaces/themes` is still implemented and covered by tests/openapi output.
- `apps/api/src/modules/extensions` still contains manifest, remote hooks, repository, schema, and service code.
- `apps/api/src/modules/organization/extensions` still exposes organization extension endpoints.
- `apps/api/src/modules/projects/facade/router.py` still fronts workspace API keys, workspace settings, workspace publish, and workspace release services.
- `apps/api/src/modules/projects/content/*` currently adapts project routes to `workspaces.content.*` canonical services.
- `apps/api/src/modules/workspaces/content`, `workspaces/publish`, and `workspaces/releases` carry project deliverable responsibilities that belong under `projects`.

## Target Boundary

- User: identity, profile, preferences.
- Workspace: collaboration container for members, invites, roles, billing, shared assets, shared templates, and global integrations.
- Project: deliverable website project for content models, entries, pages, SEO, domains, API keys, automation, release workflow, and project configuration.
- Site/Publishing: project runtime/public delivery boundary, currently one primary runtime per project.

## Execution Rules

- Keep existing user-deleted `.codex-tasks` and `docs/plans` removals untouched.
- Make hard cuts rather than compatibility shims.
- Prefer moving code to the correct domain and then deleting stale wrappers.
- No parent row is `DONE` until its validation command succeeds or its blocker is recorded as `FAILED`.
- Subagents may inspect and edit disjoint paths only; main agent coordinates integration and final validation.
