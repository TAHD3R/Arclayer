# FastAPI Backend Folder Architecture (`apps/api`)

This document defines the target backend architecture for CelestialCMS. It is a normative guideline: it describes how code must be organized, how layers may depend on each other, and how new files should be placed.

## 1. Goals

- Keep boundaries explicit and enforceable.
- Minimize coupling between domain code and framework/bootstrap code.
- Keep plugin capabilities extensible without leaking domain internals.
- Make code placement predictable for every contributor.

## 2. Canonical Layer Map

| Layer | Directory | Responsibility | Must Not Own |
| --- | --- | --- | --- |
| API aggregation | `modules/api_aggregation/` | Versioned router composition and route grouping | Business workflows and data access |
| Domain modules | `modules/` | Product/business capabilities, use cases, domain policies | Cross-domain infrastructure drivers |
| Core runtime | `core/` | App factory, middleware, exception handlers, HTTP protocol contracts, observability integration | Domain-specific business logic |
| Infrastructure | `infra/` | Cache, storage, limiter, background worker adapters | Product policies and feature-level orchestration |
| Shared primitives | `common/` | Base classes, shared schemas/types, cross-domain protocols, utility helpers | Product-specific workflows |
| Plugin runtime | `plugin/` | Plugin loading, manifest parsing, host runtime, plugin route registration, event bus | Direct feature implementation in domain modules |
| Runtime settings | `settings/` | Runtime schema, validation, encryption helpers, scope semantics | API routing or domain workflows |
| Bootstrap entrypoints | `main.py`, `bootstrap.py` | Process startup and domain bootstrap wiring | Reusable domain logic |

## 3. Directory Responsibilities

### `modules/api_aggregation/` (route aggregation only)

- Compose routers from `modules/*` and plugin routes.
- Keep versioning (`v1`) and route grouping explicit.
- Do not implement service/repository behavior here.

### `modules/` (domain implementation)

- Each domain capability must live in `modules/<domain>/`.
- Preferred shape includes `router` / `service` / `repository` / `schema`.
- Subdomain packages are allowed (for example `modules/workspaces/team/*`, `modules/system/admin/menus/*`) when domain size grows.
- Router must not call repository directly.

### `core/` (cross-cutting runtime)

- Own app factory (`core/registry.py`), route registration (`core/routes.py`), and global middlewares/handlers.
- Own framework-level HTTP contracts (`core/http/*`) and exception protocol (`core/exceptions/*`).
- Keep this layer domain-neutral.

### `infra/` (technical adapters)

- Own technology-facing adapters (`cache`, `storage`, `limiter`, `jobs`, asset processors).
- Keep adapters reusable and policy-light.
- Avoid introducing product feature branching in this layer.

### `common/` (shared, logic-neutral primitives)

- Own shared constants/enums, base schemas/services/repositories, reusable protocols, common types, and utility helpers.
- Promote reusable code here instead of duplicating across modules.
- Treat `common/` as the first destination for cross-domain reuse.

### `plugin/` (plugin host/runtime)

- Own plugin discovery, install/load lifecycle, host runtime, event bus, and plugin route registration.
- Keep plugin runtime contracts explicit and versionable.
- Avoid introducing business policy that belongs to `modules/*`.

### `settings/` (runtime contract)

- Own runtime setting schemas, scope definitions, validation, and secret handling helpers.
- Keep environment/runtime semantics centralized.

### `tests/` (test mirror)

- Mirror production structure (`tests/modules/*`, `tests/core/*`, `tests/infra/*`, `tests/common/*`, `tests/plugin/*`).
- Place test utilities under `tests/utils` or shared fixtures in `tests/conftest.py`.

## 4. Module Internal Pattern (including subdomains)

Use this pattern as the default:

- `router.py`: request/response wiring, dependencies, endpoint metadata.
- `service.py` (or `*_service.py`): business orchestration, policy enforcement, transactional flow.
- `repository.py` (or split repositories): persistence operations and query composition.
- `schema.py` (or split schemas): Pydantic v2 request/response contracts.

When a module grows, split by subdomain instead of creating monolithic files. Example strategy:

- `modules/workspaces/team/router.py`
- `modules/workspaces/team/service.py`
- `modules/workspaces/team/repository.py`
- `modules/workspaces/team/schema.py`

## 5. Dependency Direction Rules (mandatory)

### 5.1 Allowed dependency matrix

| Caller | Allowed imports |
| --- | --- |
| `modules/api_aggregation/` | `modules/`, `plugin/`, minimal `core/` contracts |
| `modules/*/router` | same-module `service/schema/deps`, `core/http`, `core/exceptions`, `common/*` |
| `modules/*/service` | same-module `repository/schema`, `common/*`, selected `core/*` cross-cutting helpers |
| `modules/*/repository` | same-module `models`, `infra/*` adapters, `common/*` |
| `core/` | `modules/api_aggregation/` (mounting), `infra/*`, `plugin/*`, `settings/*` |
| `infra/` | `common/*`, external drivers, low-level model access only when unavoidable |
| `plugin/` | `common/*`, `settings/*`, plugin runtime contracts, minimal integration boundaries |

### 5.2 Hard prohibitions

- No circular dependencies across top-level layers.
- No router-to-repository direct calls.
- No business workflow logic in `api/` or `core/`.
- No copy-paste shared logic across multiple modules when `common/` can host it.

### 5.3 Exception policy

If a dependency must break the matrix temporarily:

1. Add an inline comment explaining why the exception exists.
2. Add a follow-up remediation task in `docs/plans/`.
3. Keep exception scope minimal (single module path, not blanket permission).

## 6. File Placement Decision Rules

Use this order before creating new files:

1. Is this business/domain behavior? -> `modules/<domain>/...`
2. Is this framework/runtime wiring? -> `core/...`
3. Is this external system adapter logic? -> `infra/...`
4. Is this plugin host/runtime behavior? -> `plugin/...`
5. Is this reusable and domain-neutral? -> `common/...`
6. Is this runtime config schema/validation/crypto? -> `settings/...`

If a new directory is introduced, include a minimal README or guideline entry.

## 7. Project-Specific Mandatory Conventions

### 7.1 Command execution

- Run backend workflows through package scripts (`pnpm api`, `pnpm api:check`, `pnpm --filter @celestial/api <script>`, or `pnpm -C apps/api <script>`).
- Do not bypass scripts via direct `.venv` binary execution.

### 7.2 Public identifier contract

- External API IDs must use `PublicUUID` (`apps/api/common/types/public_uuid.py`).
- Do not expose raw UUID values in public response contracts.

### 7.3 Schema-driven API contract

- Use Pydantic schemas for request/response contracts.
- Do not handcraft business JSON payloads in router endpoints.

### 7.4 Reuse and maintainability

- Reject monolithic files when responsibilities diverge.
- Promote shared constants/enums/protocols/utilities to `common/`.
- Search existing helpers before adding new utility methods.

### 7.5 Database migrations (Tortoise)

- Use the Tortoise ORM v1+ built-in migrations system (Aerich is legacy and incompatible with `tortoise-orm>=1.0.0`).
- New migration files are generated under `apps/api/tortoise_migrations/**`. Do not hand-write migration files there.
- Generate migrations via `pnpm -C apps/api db:migrate` and apply via `pnpm -C apps/api db:upgrade`.
- If a migration requires custom SQL or data transforms:
  - Generate the file via `db:migrate` first, then apply minimal edits to the generated operations.

## 8. Architecture PR Checklist

A backend PR should pass all items:

- New files are in the correct layer and respect ownership boundaries.
- Router/service/repository boundaries are preserved.
- Public API IDs use `PublicUUID` where applicable.
- No new circular import direction was introduced.
- Shared logic is extracted instead of duplicated.
- Any temporary boundary exception is documented and tracked in `docs/plans/`.
