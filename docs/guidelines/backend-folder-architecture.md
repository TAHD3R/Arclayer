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
| Infrastructure | `src/platform/**` | cache, storage, jobs, limiter, external adapters | product policy and endpoint logic |
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
- `core/routes.py` owns the `/content-api/v1` and reserved `/management-api/v1` prefix decisions.
- Domain routers should express only their local path semantics.
- Public delivery routes that intentionally live outside `/api/v1` must be mounted explicitly from `core/routes.py`.
- Runtime content reads, preview reads, GraphQL delivery, site resolution, and sitemap routes belong under `/content-api/v1`.
- Authenticated Admin UI operations remain under `/api/v1`.

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
| `src/platform/**` | `common/**`, external drivers, low-level adapters |

Hard prohibitions:

- no router-to-repository direct calls
- no business workflow logic in `core/routes.py`
- no circular imports across layers
- no cross-domain orchestration hidden in repositories

## 7. Repository Foundation Rules

All ORM-backed repositories use one canonical foundation:

```python
from src.core.repository.implementations.tortoise import TortoiseORMRepository
```

Model-bound repositories set `model_cls` on the concrete class:

```python
class ProjectRepository(TortoiseORMRepository[Project]):
    model_cls = Project
```

Tenant-scoped repositories keep tenant binding in the tenant-aware base:

```python
class ProjectContentItemsRepository(TenantScopedRepository[ContentItemRecord]):
    model_cls = ContentItemRecord
```

Repository methods that participate in a service transaction accept an explicit `conn` parameter or run through a repository instance bound to the transaction. Use `_using_db_kwargs(conn)` and `using_db(query, conn)` from `TortoiseORMRepository` for Tortoise connection propagation.

Shared ORM mechanics belong in `TortoiseORMRepository`. Tenant filtering belongs in tenant-aware repository bases. Domain query helpers belong in the domain repository. Business orchestration belongs in services.

Forbidden legacy surfaces:

```python
from src.common.repositories.base import BaseRepository
from src.common.repositories import BaseRepository

class ProjectRepository(BaseRepository):
    ...

BaseRepository = TortoiseORMRepository
```

## 8. Service Foundation Rules

All production service classes that own orchestration, persistence access, settings access, transactions, or domain events use `BaseService`:

```python
from src.core.services import BaseService


class WorkspaceTeamService(BaseService):
    def __init__(
        self,
        settings: Settings,
        *,
        repo: WorkspaceTeamRepository | None = None,
        event_publisher: DomainEventPublisher | None = events,
    ) -> None:
        super().__init__(settings, event_publisher=event_publisher)
        self.repo = repo or WorkspaceTeamRepository()
```

Constructor parameters after `settings` are keyword-only for dependencies. Repositories, sibling services, event publishers, lifecycle dispatchers, storage adapters, and test doubles are injected at the constructor or module factory boundary. Business methods should receive data and explicit context, then call already-wired dependencies.

Service-level transactions start from `BaseService.tx()`:

```python
async with self.tx() as conn:
    await self.repo.update_workspace(..., conn=conn)
    await self.entity_manager.update(..., conn=conn)
```

Nested service/repository work receives `conn` explicitly or uses a repository instance bound to the same transaction. Avoid adding `tx()` around calls that ignore the yielded connection because that creates false transaction semantics.
Service methods use `self.tx()` for default database transactions; direct `in_transaction()` calls are limited to `BaseService.tx()` and documented non-service infrastructure. Tenant-scoped services may use a tenant router connection helper when the helper preserves the same explicit connection-passing semantics.

Service-level domain events go through `BaseService.publish_domain_event()` or the documented optional helper:

```python
await self.publish_domain_event(
    name="workspace.member.invited",
    payload={"workspace_id": str(workspace_id)},
    actor_user_id=actor_user_id,
    source="api",
)
```

Required business or audit events use `publish_domain_event()` so publisher configuration and publish failures surface as typed service-contract errors. Non-critical observability fanout uses `publish_optional_domain_event()` and logs skipped/failed publication.

Actor and Activity metadata comes from `BaseService.resolve_actor_context()`. The helper accepts explicit overrides for jobs and reads approved request context variables for request flows. Service business methods should pass actor/context values through arguments or typed context objects.

Allowed pure mixins contain helper behavior and are composed into a `BaseService` subclass. Mixins that publish events should call the host service's `BaseService` publisher instead of carrying their own event bus dependency.

### 8.1 Full-flow Activity audit coverage

Compliance-critical Activity events are business evidence, not observability fanout. A mutation is covered only when all of these are true:

- The operation has a stable event name from the documented family vocabulary, such as `workspace.member.invited`, `content.item.published`, or `system.storage.updated`.
- The event uses a typed Pydantic v2 payload model with explicit actor/context/entity fields and bounded sanitized properties.
- The service receives or resolves actor context through `BaseService.resolve_actor_context()`.
- The Activity evidence is written inside the same business transaction or through an outbox row created in that same transaction.
- Rollback tests prove failed business writes leave no committed `AuditEvent` or outbox evidence.
- Readback tests prove the user-visible Activity API can return the event.
- Sanitization tests prove password, token, secret, credential, authorization, cookie, and raw API key material is absent from persisted properties.

`ActivityIngestor` remains valid for non-critical operational telemetry, but its in-process queue and drop-on-overload behavior are not sufficient for compliance-critical business mutations. Required audit events must not use `publish_optional_domain_event()` as their only delivery path. Route helpers and services must not swallow non-fatal Activity publish failures for required audit evidence.

For entity changes already flowing through `EntityManager`, prefer service-owned `before_commit` hooks or a same-transaction outbox write that receives the actor/context and transaction connection explicitly. Lifecycle subscribers may fan out non-critical runtime work, but they must not be the required Activity evidence path unless they can preserve actor context, organization/workspace context, and rollback semantics in the same transaction.

Every Activity coverage rollout updates `docs/plans/architecture-hard-cut-2026-05-04/activity-coverage-matrix.md`. A row may be marked `Complete` only after the event name, payload model, durable path, sanitizer, readback test, and rollback test are recorded.

## 9. Model and Table Rules

### 9.1 Table namespace contract

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

### 9.2 Model docstring rule

- The first line of every model docstring is normative.
- It must be standardized because it is used as the database table comment in admin tooling.
- Keep the first line short and stable. Examples:
  - `"""Domain model for asset records."""`
  - `"""Global model for OAuth identities."""`
  - `"""Internal model for system configuration revisions."""`
- Additional lines may explain scope or behavior, but the first line must stay clean.

### 9.3 Content model storage sync

- Runtime content field values are stored in `ContentVersionRecord.fields_snapshot` on `domain_content_versions`.
- Content model schema revisions are tracked through `draft_contract_revision`, `published_contract_revision`, and canonical snapshot payloads.
- The storage sync strategy is `jsonb_snapshot`: content model changes generate a storage plan that describes JSONB field paths, registry-resolved database type hints, forward migration steps, and rollback steps.
- `AbstractFieldType.get_db_column_type()` is the extension point for generated indexes, projections, API generation, and future storage strategies; it does not imply one physical content table per model.
- Dynamic physical tables require a separate tenant migration engine, online backfill plan, and rollback design before they become a runtime storage strategy.

## 10. Router Metadata Rules

- Router tags must use the dotted domain vocabulary:
  - `domain.*`
  - `global.*`
  - `internal.*`
  - `external.*`
- Endpoint functions must contain concise product-facing docstrings inside the function body.
- Prefer obvious, literal wording over internal implementation jargon.

## 11. Migration Rules

- Use the built-in Tortoise migration flow via:
  - `pnpm --filter @arclayer/api db:migrate`
  - `pnpm --filter @arclayer/api db:upgrade`
- Treat migration files as command-generated artifacts.
- Do a schema change in models first, then generate the migration with `db:migrate`, then apply it with `db:upgrade`.
- Do not hand-write or hand-edit migration file contents.
- If a generated migration includes unrelated drift or duplicate schema operations:
  - audit the model change against the existing migration chain
  - remove the redundant generated migration artifact
  - regenerate through `db:migrate`
- Keep the migration chain command-driven and reviewable.

## 12. Hard-Cut Architecture Rule

- Do not keep old and new architecture paths alive in parallel by default.
- When correcting a backend architecture mistake, remove the obsolete path cleanly in the same change set.
- This applies to:
  - route composition layers
  - table namespaces
  - endpoint contract surfaces
  - stale module shells

## 13. Validation Expectations

Prefer the narrowest validation that matches the change:

- syntax and import safety: `pnpm -C apps/api uv -- python -m compileall src/models src/modules src/migrations`
- focused backend tests: `pnpm -C apps/api uv -- pytest ...`
- broader API suite: `pnpm api:check`

Backend work is not complete until validation results and residual risks are recorded honestly.

## 14. Architecture Checklist

- [ ] Route registration happens from `src/core/routes.py`, not an aggregation layer.
- [ ] Files live in the correct layer.
- [ ] Router/service/repository/schema responsibilities stay separated.
- [ ] The reference pattern still looks like `modules/analytics`.
- [ ] `Meta.table` uses the required namespace prefix.
- [ ] The model docstring first line is standardized.
- [ ] Router tags use dotted `domain/global/internal/external` semantics.
- [ ] Endpoint functions include concise product docstrings.
- [ ] Migration artifacts match the real schema change without unrelated drift.
