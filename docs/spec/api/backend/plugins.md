# Extension Framework Contracts

This spec defines Extension runtime phases, registration boundaries, and app integration.

## Scenario: Extension Discovery, Lifecycle Phases, and Registry Ownership

### 1. Scope / Trigger

- Trigger: adding/changing Extension hooks, loaders, runtime startup wiring, or extension config.
- Applies to:
  - `apps/api/src/core/extensions/manifest.py`
  - `apps/api/src/core/extensions/manager.py`
  - `apps/api/src/core/extensions/tenant_registry.py`
  - `apps/api/src/core/extensions/middleware_dispatcher.py`
  - `apps/api/src/core/extensions/workspace_context_middleware.py`
  - `apps/api/src/core/registry.py` (AppFactory integration).

### 2. Signatures

- Extension lifecycle phases:
  - Load: `UNLOADED → LOADED` (manifest parsed, entry module imported)
  - Register: `LOADED → REGISTERED` (`arclayer_register(registry)` called)
  - Bootstrap: `REGISTERED → READY` (`arclayer_bootstrap(app)` called)
  - Ready: extension ready to serve
  - Destroy: `READY → DESTROYED` (`arclayer_destroy()` called)
- ExtensionManager:
  - `load_all()` — discover and load extensions from `plugins/*/extension.json`
  - `register_all(app)` — call `arclayer_register` on each plugin, sync to tenant-aware registries
  - `bootstrap_all(app)` — call `arclayer_bootstrap` on each plugin
  - `ready_all(app)` — call `arclayer_ready` on each plugin
  - `destroy_all()` — call `arclayer_destroy` on each plugin
  - `activate(extension_name, workspace_id) -> int` — async, increments `domain_workspaces.extension_revision`
  - `deactivate(extension_name, workspace_id) -> int` — async, increments `domain_workspaces.extension_revision`
- Plugin contract:
  - `create_plugin()` — factory exported from entry module
  - `plugin.arclayer_register(registry: PluginRegistry)` — register capabilities
  - `plugin.arclayer_bootstrap(app)` — optional post-register init
  - `plugin.arclayer_ready(app)` — optional ready signal
  - `plugin.arclayer_destroy()` — optional cleanup

### 3. Contracts

- Extension runtime: `ExtensionManager` is the single runtime owner.
- App state after init:
  - `app.state.extension_manager` — the `ExtensionManager` instance
  - `app.state.plugin_registry` — canonical `PluginRegistry` (`mgr.registry`)
  - `app.state.extension_registries` — tenant-aware `TenantAwareRegistrySet`
  - `app.state.extension_middleware_registry` — registry used by the Dispatcher middleware
- Middleware order (outermost to innermost):
  `Security → GZip → TrustedHost → HTTPSRedirect → Locale → RequestLog → CorrelationId → WorkspaceContext → Dispatcher → Routes`
- Capabilities declared in `extension.json` `provides` must be registered in `arclayer_register()`.
  Mismatches raise `ExtensionRegistrationError` at startup.
- Cross-extension resource name conflicts raise `ExtensionResourceConflictError` at registration.
- `activate`/`deactivate` validate state transition before DB write; failed transitions do not increment revision.
- Dispatcher runs after `WorkspaceContextMiddleware` sets `request.state.workspace_id`.
  Extension hooks never see unactivated workspace requests.
  Auth context (`workspace_id`, `user_id`, `organization_id`) is snapshot before hooks and restored after.

### 4. Validation & Error Matrix

| Condition | Required behavior |
|---|---|
| Duplicate extension loaded | Raise `ExtensionLoadError` |
| Manifest missing or invalid | Raise `ManifestParseError` and fail startup |
| Entry module missing `create_plugin` | Raise `ExtensionLoadError` |
| `provides` capability not registered in `arclayer_register()` | Raise `ExtensionRegistrationError` |
| Cross-extension resource name conflict | Raise `ExtensionResourceConflictError` |
| activate before extension is READY | Raise `CoordinationError` (revision unchanged) |
| activate with invalid workspace_id | Raise `CoordinationError` (revision unchanged) |
| activate for non-existent extension | Raise `CoordinationError` |

### 5. Good/Base/Bad Cases

- Good: Extension declares `provides.services: ["health"]` and `arclayer_register(registry)` calls `registry.services.register("health", HealthService())`.
- Good: Extension is loaded, registered, bootstrapped, and ready before any workspace activates it.
- Good: Workspace activation increments `domain_workspaces.extension_revision` transactionally.
- Base: project has no extensions; runtime still initializes with zero extensions loaded.
- Bad: Extension declares a service in manifest but does not register it in `arclayer_register()`.
- Bad: Activate called before extension is READY — state transition fails, revision unchanged.
- Bad: Direct mutation of `app.state.plugin_registry` outside ExtensionManager lifecycle.
