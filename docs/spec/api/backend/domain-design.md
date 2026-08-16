# Backend Domain Design Contracts

This code-spec defines backend domain boundaries, public identifier contracts, and hard-cut evolution rules for API-facing domain design.

## Scenario: Domain Module Boundaries and Public API Semantics

### 1. Scope / Trigger

- Trigger: creating/changing backend domain modules, API contracts, route tags, public identifiers, or domain ownership boundaries.
- Applies to:
  - `apps/api/src/modules/**`
  - `apps/api/src/core/routes.py`
  - API schemas and endpoint metadata
  - shared contract references from `docs/spec/shared/**` and backend architecture guidance.

### 2. Signatures

- API surface taxonomy:
  - Product API: `/api/v1/*`
  - Content API: `/content-api/v1/*`
  - Management API: `/management-api/v1/*` (reserved/explicit ownership)
- Domain module baseline shape:
  - `router.py`, `service.py`, `repository.py`, `schema.py`
- Tag vocabulary:
  - `domain.*`, `global.*`, `internal.*`, `external.*`
- Public identifier contract:
  - external contracts use `PublicUUID` instead of raw persistence UUID semantics.

### 3. Contracts

- Domain modules are the primary product capability boundary and must keep router/service/repository/schema separation.
- `core/routes.py` owns global prefix and cross-surface route registration; domain modules must not redefine top-level surfaces.
- Router tags are part of API governance and must use dotted vocabulary by ownership domain.
- Endpoint functions must include concise product-facing docstrings.
- Public API payloads must not leak persistence details (for example DB table naming, internal ORM semantics).
- Public entity identifiers in endpoint params and response schemas must follow `PublicUUID` contract.
- CSRF and auth surface policies must be enforced per surface taxonomy:
  - browser-authenticated unsafe Product API calls require CSRF contract
  - content API credential-based routes remain on explicit token/key boundary.
- Hard-cut policy applies to domain/API evolution:
  - remove obsolete contract surfaces in same rollout
  - avoid dual-track compatibility branches without explicit approved plan.

### 4. Validation & Error Matrix

| Condition | Required behavior |
|---|---|
| New endpoint returns ad hoc dict envelope | Replace with typed `ResponseModel[T]` + shared response helpers |
| Route tag uses title-cased or ad hoc vocabulary | Normalize to dotted domain/global/internal/external tag |
| External path/query/body ID typed as raw UUID contract | Replace with `PublicUUID` contract type |
| Domain router redefines global prefix ownership | Move prefix decision back to `core/routes.py` |
| Breaking API field change introduced | Apply hard-cut rollout with synchronized client updates (no hidden fallback shells) |
| Content-delivery or runtime route mounted on wrong surface | Re-register under `/content-api/v1` via `core/routes.py` |

### 5. Good/Base/Bad Cases

- Good: runtime content read endpoints stay under `/content-api/v1` with content-api auth dependencies.
- Good: authenticated Product Application operations remain under `/api/v1` and use shared response envelope contracts.
- Base: management routes are introduced under reserved `/management-api/v1` only when programmatic ops require a distinct surface.
- Bad: a module directly publishes legacy and new endpoint shapes in parallel with implicit fallback behavior.
- Bad: endpoint schema exposes raw persistence-centric fields that frontend cannot treat as stable contract.

### 6. Tests Required

- Endpoint tests must assert:
  - response envelope structure
  - stable error codes
  - route-level auth/csrf behavior for each API surface.
- Contract tests must assert public identifier format and tag vocabulary for new or changed routers.
- When hard-cut API changes occur, backend/frontend integration checks must verify client contract alignment (generated OpenAPI consumers).

### 7. Wrong vs Correct

#### Wrong

```python
router = APIRouter(prefix="/api/v1/projects", tags=["Projects"])
```

#### Correct

```python
router = APIRouter(prefix="/projects", tags=["domain.projects"])
```

Global `/api/v1` ownership stays in `core/routes.py`; domain router exposes local semantics and governed tag vocabulary.
