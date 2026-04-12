# FastAPI Backend Folder Architecture (`apps/api`)

This document describes the live backend architecture for Arclayer.
It is normative: new backend code should follow these placement and dependency rules unless a narrower exception is explicitly justified.

## 1. Goals

- Keep boundaries explicit and enforceable.
- Keep route composition simple and visible.
- Keep domain code out of framework/bootstrap layers.
- Favor hard cuts over compatibility scaffolding when architecture is being corrected.

## 2. Canonical Layer Map

| Layer | Directory | Responsibility | Must Not Own |
| --- | --- | --- | --- |
| Route registration | `src/core/routes.py` | top-level router registration, global prefix helpers, public vs versioned surface decisions | business workflows, persistence, cross-domain orchestration |
| Domain modules | `src/modules/**` | product capabilities, router/service/repository/schema implementation | framework bootstrap and generic infrastructure |
| Persistence models | `src/models/**` | Tortoise models and DB table metadata | request parsing, HTTP routing, business orchestration |
| Core runtime | `src/core/**` | app factory, middleware, exception handling, HTTP protocol contracts, runtime initialization | product-specific business rules |
| Infrastructure | `src/infra/**` | cache, storage, jobs, limiter, external adapters | product policy and endpoint logic |
| Shared primitives | `src/common/**` | reusable types, base classes, protocols, helpers, shared constants | feature-specific workflows |
| Runtime settings | `src/settings/**` | settings schema, validation, crypto helpers, runtime scope semantics | domain routing and business orchestration |
| Migrations | `src/migrations/**` | schema transitions for live databases | runtime business logic |

## 3. Route Composition Rules

### 3.1 No aggregation layer

- Do not introduce or reintroduce `api_aggregation`, `aggregation`, or similar router orchestration packages.
- Route composition lives in `apps/api/src/core/routes.py`.
- The live composition pattern is helper-based and explicit:
  - `include_router_with_global_prefix_prepended(...)`
  - `include_auth_router_with_prefix(...)`
  - `register_routes(...)`

### 3.2 Prefix ownership

- `core/routes.py` owns the shared `/api/v1` prefix decision.
- Domain routers should express only their local path semantics.
- Public delivery routes that intentionally live outside `/api/v1` must be mounted explicitly from `core/routes.py`.

## 4. Domain Module Shape

Use this as the default module pattern:

- `router.py`: HTTP transport wiring, dependencies, `response_model`, tags, endpoint docstrings
- `service.py`: orchestration, policy, transactional flow
- `repository.py`: persistence access and query composition
- `schema.py`: Pydantic request/response contracts

When a module grows, split by subdomain instead of growing one monolith. Examples:

- `modules/organization/members/*`
- `modules/workspaces/team/*`
- `modules/system/admin/notifications/*`

## 5. Reference Module

The normative reference module for new backend work is:

- `apps/api/src/modules/analytics`

Why `analytics` is the reference:

- thin router
- clear router/service/repository/schema separation
- enough tests to act as a trustworthy example
- small enough to stay readable without hiding responsibilities in secondary abstractions

When docs or skills need an example module, prefer `analytics` unless the example is specifically about another domain surface.

## 6. Dependency Direction Rules

| Caller | Allowed imports |
| --- | --- |
| `src/core/routes.py` | `src/modules/**`, `src/config` |
| `src/modules/**/router.py` | same-module `service/schema`, shared HTTP/core helpers, reusable `common/**` helpers |
| `src/modules/**/service.py` | same-module `repository/schema`, `common/**`, targeted `core/**` helpers when truly cross-cutting |
| `src/modules/**/repository.py` | `src/models/**`, targeted `infra/**`, reusable `common/**` helpers |
| `src/core/**` | `src/modules/**` only for app/runtime wiring, plus `infra/**`, `settings/**`, `common/**` |
| `src/infra/**` | `common/**`, external drivers, low-level adapters |

Hard prohibitions:

- no router-to-repository direct calls
- no business workflow logic in `core/routes.py`
- no circular imports across layers
- no cross-domain orchestration hidden in repositories

## 7. Model and Table Rules

### 7.1 Table namespace contract

- `Meta.table` is mandatory for authored models.
- Table names must use one of these prefixes:
  - `domain_*`
  - `global_*`
  - `internal_*`
  - `external_*`
- Choose the prefix by runtime ownership:
  - `domain_*`: ordinary product-domain data
  - `global_*`: global auth/account scope
  - `internal_*`: internal/system-governance data
  - `external_*`: externally-facing ingestion/proxy boundaries when they truly deserve a separate namespace

### 7.2 Model docstring rule

- The first line of every model docstring is normative.
- It must be standardized because it is used as the database table comment in admin tooling.
- Keep the first line short and stable. Examples:
  - `"""Domain model for asset records."""`
  - `"""Global model for OAuth identities."""`
  - `"""Internal model for system configuration revisions."""`
- Additional lines may explain scope or behavior, but the first line must stay clean.

## 8. Router Metadata Rules

- Router tags must use the dotted domain vocabulary:
  - `domain.*`
  - `global.*`
  - `internal.*`
  - `external.*`
- Endpoint functions must contain concise product-facing docstrings inside the function body.
- Prefer obvious, literal wording over internal implementation jargon.

## 9. Migration Rules

- Use the built-in Tortoise migration flow via `pnpm -C apps/api db:migrate`.
- For straightforward additive changes, accept the generated migration after review.
- For destructive corrections, table renames, or data rewrites:
  - generate the migration first
  - then hand-edit the generated file to the minimal explicit operations required
- Do not accept auto-generated migrations that mix the intended schema move with unrelated model deletion or drift.

## 10. Hard-Cut Architecture Rule

- Do not keep old and new architecture paths alive in parallel by default.
- When correcting a backend architecture mistake, remove the obsolete path cleanly in the same change set.
- This applies to:
  - route composition layers
  - table namespaces
  - endpoint contract surfaces
  - stale module shells

## 11. Validation Expectations

Prefer the narrowest validation that matches the change:

- syntax and import safety: `pnpm -C apps/api uv -- python -m compileall src/models src/modules src/migrations`
- focused backend tests: `pnpm -C apps/api uv -- pytest ...`
- broader API suite: `pnpm api:check`

Backend work is not complete until validation results and residual risks are recorded honestly.

## 12. Architecture Checklist

- [ ] Route registration happens from `src/core/routes.py`, not an aggregation layer.
- [ ] Files live in the correct layer.
- [ ] Router/service/repository/schema responsibilities stay separated.
- [ ] The reference pattern still looks like `modules/analytics`.
- [ ] `Meta.table` uses the required namespace prefix.
- [ ] The model docstring first line is standardized.
- [ ] Router tags use dotted `domain/global/internal/external` semantics.
- [ ] Endpoint functions include concise product docstrings.
- [ ] Migration artifacts match the real schema change without unrelated drift.
