# Celestial Framework API Architecture (apps/api)

This folder contains the FastAPI backend service.

## Goals

- Clear layering: avoid "misc" folders that mix concerns.
- Predictable imports: each layer has a well-defined dependency direction.
- Plugin-first extensibility: core domain capabilities can be implemented by plugins.
- Long-term maintainability: where a file should live is obvious.

## Folder Responsibilities

### `apps/api/core/` (Application bootstrap & cross-cutting concerns)

What belongs here:

- App factory / lifespan (`core/registry.py`)
- Route wiring (`core/routes.py`)
- Cross-cutting concerns: logging, observability, i18n, authz, middleware, exception handlers

What must NOT belong here:

- Infrastructure implementations (DB/Redis/Rate limiting clients)
- HTTP response shapes (response envelopes, pagination schemas)
- Plugin extension-point contracts (they belong to `apps/api/plugin/`)

### `apps/api/infra/` (Infrastructure & external integrations)

Infrastructure implementations and clients. Typical examples:

- `infra/db/`    : ORM init/close, DB health checks
- `infra/cache/` : Valkey/Redis client init/close
- `infra/limiter/`: rate limiter integration (FastAPI-Limiter, storage coupling)

`core/` can call into `infra/`, but `infra/` should not depend on `routers/`.

### `apps/api/http/` (HTTP-level contracts & utilities)

HTTP concerns that are shared across routers:

- Response envelope (`http/response.py`)
- Pagination query params + response schema (`http/pagination.py`)

Rule of thumb: if it shapes OpenAPI or is used by many routers, it likely belongs here.

### `apps/api/routers/` (API surface / versioned routes)

API routers grouped by version and domain.

For each domain module:

- `router.py` only does request parsing + dependency wiring + returns `Response.success(...)`.
- Business logic lives in `service.py`.
- Data access lives in `repository.py`.
- Input/output schemas live in `schema.py` (Pydantic v2).

### `apps/api/plugin/` (Plugin system)

Plugin loader, registry, manifests, and all plugin-related primitives.

Extension point contracts live under:

- `apps/api/plugin/extension_points/`

Each module defines:

- the extension-point name constant
- a `Protocol` contract
- registration code (to declare the extension point)
- a getter (to resolve the implementation from the registry)

The app bootstrap explicitly calls `init_extension_points()` so plugins can safely register their implementations during startup.

### `apps/api/common/` (Shared primitives)

Reusable building blocks that are not HTTP-specific and not infrastructure-specific:

- `common/schemas/` base schemas / mixins
- `common/services/` base services
- `common/repositories/` base repositories
- `common/utils/` small pure helpers

## Dependency Rules (Import Direction)

Recommended import direction:

- `routers/*` -> `http/`, `core/` (cross-cutting only), `common/`, `plugin/extension_points/*`, and local `service/repository/schema`
- `service`  -> `repository`, `common/`, `core/exceptions`, `core/i18n`
- `repository` -> `infra/*`, `models/*`
- `core` -> `infra/*`, `plugin/*`, and `routers/*` only for route wiring
- `plugin/*` -> `common/`, `http/` (contracts), but avoid depending on `routers/*`

If you see cycles, it's a sign that responsibilities are mixed and a module should be moved.
