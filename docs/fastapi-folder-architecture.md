# Celestial Framework API Architecture (apps/api)

This document defines the directory organization, responsibility boundaries, and dependency rules for the FastAPI backend service. The goal is to ensure high cohesion, low coupling, and a "plugin-first" extensibility model.

## 1. Core Goals

* **Clear Layering**: Eliminate "misc" or "utils" folders that mix concerns; every line of code has a predictable home.
* **Predictable Dependencies**: Maintain a strictly unidirectional dependency flow to prevent circular imports.
* **Plugin-First Extensibility**: Core domain capabilities are defined via "Extension Points," allowing plugins to provide implementations.
* **Long-term Maintainability**: Make it obvious where a file should live, reducing cognitive load for contributors.


## 2. Folder Responsibilities

### `core/` (Application Bootstrap & Cross-Cutting Concerns)

**Role**: The "brain" of the application, responsible for startup, configuration, and global policies.

* **In-Scope**:
* App factory and lifespan management (`registry.py`, `lifespan.py`).
* Centralized route wiring and mounting (`routes.py`).
* Cross-cutting concerns: Logging, Observability, i18n engine, Authz strategies, Middleware, and Global Exception Handlers.


* **Out-of-Scope**: Infrastructure implementation details (e.g., DB pool instances), HTTP response envelopes, or plugin extension contracts.

### `infra/` (Infrastructure & External Integrations)

**Role**: Encapsulation of technical details and external drivers.

* **In-Scope**:
* `db/`: ORM initialization/cleanup, DB health checks.
* `cache/`: Valkey/Redis client wrappers.
* `limiter/`: Rate limiter storage and adapter integration.


* **Rule**: `core/` may call `infra/`, but `infra/` must **never** depend on `routers/`.

### `core/http/` (HTTP Communication Contracts)

**Role**: Defines the "shape" of the API to ensure a consistent contract between frontend and backend.

* **In-Scope**:
* Standard Response Envelope (`response.py`): e.g., `Response.success(...)`.
* Pagination Protocols (`pagination.py`): Common query parameters and response schemas.



### `routers/` (API Surface / Domain Logic)

**Role**: Domain-specific modules following the **Router-Service-Repository** pattern.
Internal structure for each domain module:

* `router.py`: Handles request parsing, dependency injection wiring, and returns standard responses.
* `service.py`: Core business logic, validation, and workflow orchestration.
* `repository.py`: Data persistence logic; the only layer directly interacting with Models/DB.
* `schema.py`: Pydantic V2 models for input validation and output serialization.

### `plugin/` (Plugin System Core)

**Role**: The engine for plugin loading, registration, and discovery.

* **Extension Points**:
* **Path**: `apps/api/plugin/extension_points/`
* **Definition**: Each module defines a constant name, a `Protocol` contract, registration logic, and a "Getter" to resolve implementations.


* **Workflow**: The bootstrap calls `init_extension_points()`, allowing plugins to safely inject logic during startup.

### `common/` (Shared Primitives)

**Role**: Reusable building blocks that are logic-neutral.

* **In-Scope**: Base classes (BaseSchema, BaseService, BaseRepository), shared mixins, and pure utility helpers (`utils/`).


## 3. Dependency Rules (Import Direction)

To maintain a clean architecture, the following **Unidirectional Flow** is mandatory:

| Layer Initiating Call | Allowed Dependencies |
| --- | --- |
| **`routers/`** | `http/`, `core/` (cross-cutting), `common/`, `plugin/`, local service/repo/schema |
| **`service/`** | `repository/`, `common/`, `core/exceptions`, `core/i18n` |
| **`repository/`** | `infra/`, `models/` |
| **`core/`** | `infra/`, `plugin/`, `routers/` (only for mounting) |
| **`plugin/`** | `common/`, `http/` (contracts only), **Strictly NO `routers/**` |

> [!CAUTION]
> **Circular Dependency Warning**: If Layer A needs B and B needs A, your boundaries are likely blurred. Extract the shared logic to `common/` or use a `plugin` extension point to decouple them.


## 4. Coding Standards

1. **Unified Response**: All endpoints must return `core.http.response.Response.success(...)` or raise an `AppException`.
2. **Async-First**: Use `async def` for Service and Repository layers unless there is a specific blocking requirement.
3. **Explicit DI**: Use FastAPI's `Depends` in `router.py` to keep dependencies visible rather than hiding them inside services.
