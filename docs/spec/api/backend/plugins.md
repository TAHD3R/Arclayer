# Backend Plugin Contracts

This code-spec defines plugin runtime phases, hook specifications, and plugin registration boundaries in backend startup/shutdown flows.

## Scenario: Plugin Discovery, Lifecycle Phases, and Registry Ownership

### 1. Scope / Trigger

- Trigger: adding/changing plugin hooks, plugin loaders, runtime startup wiring, plugin configuration, or extension overlays.
- Applies to:
  - `apps/api/src/core/plugin/specs.py`
  - `apps/api/src/core/plugin/manager.py`
  - `apps/api/src/core/plugin/lifecycle.py`
  - `apps/api/src/core/plugin/loader.py`
  - `apps/api/src/core/plugin/runtime.py`
  - app lifecycle integration in `apps/api/src/core/registry.py`.

### 2. Signatures

- Hook spec markers:
  - `arclayer_hookspec = HookspecMarker("arclayer")`
  - `arclayer_hookimpl = HookimplMarker("arclayer")`
- Hook interface (`ArclayerSpec`):
  - `arclayer_register(registry: PluginRegistry) -> None`
  - `arclayer_bootstrap(app: object) -> None`
  - `arclayer_ready(app: object) -> None`
  - `arclayer_destroy() -> None`
- Runtime lifecycle phases:
  - `PluginLifecyclePhase`: `DISCOVER`, `LOAD`, `REGISTER`, `BOOTSTRAP`, `READY`, `DESTROY`
- Runtime init/close:
  - `init_plugin_runtime(app: FastAPI, *, project_root: Path | None = None) -> PluginRuntime`
  - `close_plugin_runtime(app: FastAPI) -> None`
- Loader entry points:
  - `discover_plugins(...)`
  - `discover_entry_point_plugins()`
  - `scan_directory_plugins(...)`.

### 3. Contracts

- Plugin runtime startup sequence must be: `LOAD -> REGISTER -> BOOTSTRAP -> READY`.
- Plugin runtime shutdown sequence must include `DESTROY`.
- `PluginManager` must add `ArclayerSpec` hook spec and expose plugin names/registry through runtime state.
- Default registry ownership is centralized in `PluginManager.run_register`: if registry is absent it creates the canonical composite `PluginRegistry` and all sub-registries.
- Plugin discovery sources are additive:
  - built-in internal plugins (`discover_internal_plugins`)
  - Python entry points group `arclayer.plugins`
  - project `plugins/` directory scan.
- Plugin load failures are hard failures at startup (`PluginLoadError`), not silent skips.
- `init_plugin_runtime` must fail if app already has initialized plugin runtime.
- App state exposure after init must include:
  - `app.state.plugin_runtime`
  - `app.state.plugin_manager`
  - `app.state.plugin_lifecycle`
  - `app.state.plugin_registry`.
- Plugin config merge behavior must be deterministic deep-merge (`default` overridden by user config) with validator-driven failure surface.
- Extension overlay contracts (`extensions/<plugin-name>/...`) can override plugin schema/server modules and must fail loudly on load errors.
- Plugin implementations must register typed resources through the provided `PluginRegistry` sub-registries; registry payloads should be Pydantic models, typed classes, or typed callables rather than unstructured dicts.
- Plugin-provided locale resources must be registered explicitly through the backend i18n runtime (`register_locale_path(path)`) during bootstrap/registration; plugin code must not mutate locale cache globals directly.
- Plugin locale directories must follow the backend locale resource shape: `<locale>/<namespace>.json`, with `zh-CN` and `en-US` parity for public error keys.

### 4. Validation & Error Matrix

| Condition | Required behavior |
|---|---|
| Plugin runtime initialized twice | Raise `RuntimeError` |
| Entry-point factory raises | Raise `PluginLoadError` and fail startup |
| Directory plugin missing `create_plugin` | Raise `PluginLoadError` |
| Lifecycle transitions called in runtime init | Complete in canonical order and set `current_phase` accordingly |
| `close_plugin_runtime` called without initialized runtime | No-op |
| Plugin config validator fails | Log validation failure and re-raise |
| Extension module cannot load | Raise import/load failure explicitly |
| Plugin registers untyped dict payload as field/provider/component definition | Replace with typed model/class/callable resource |
| Plugin adds locale resources | Call `register_locale_path(plugin_locale_dir)` and rely on cache invalidation |
| Plugin locale JSON is malformed | Startup/config validation must expose the failure or i18n loading must skip only that malformed file without corrupting other resources |

### 5. Good/Base/Bad Cases

- Good: internal `CorePlugin` uses `@arclayer_hookimpl` and participates in standard lifecycle phases.
- Good: registry creation stays inside plugin manager and plugin implementations only populate provided registry.
- Good: plugin registers `SearchProvider` as a typed provider object and registers `locales/` through `register_locale_path`.
- Base: project has no external plugins; runtime still initializes core plugin path and lifecycle.
- Bad: plugin errors are swallowed and server starts with partial plugin state.
- Bad: service/module directly mutates `app.state.plugin_registry` outside plugin runtime lifecycle.
- Bad: plugin writes directly to `_locale_paths` or `_load_locale.cache_clear()` instead of calling the i18n registration API.

### 6. Tests Required

- Runtime tests must assert phase transitions and app-state wiring on init/close.
- Loader tests must cover:
  - entry-point plugin discovery
  - directory plugin discovery
  - load failure propagation.
- Contract tests for plugin manager should verify hook invocation order and registry availability.
- If extension overlays are used, tests must cover invalid module/schema failure behavior.
- Plugin contract tests must assert typed registry resources are resolvable by name/key after `arclayer_register`.
- Locale plugin tests must assert `register_locale_path` makes plugin translations available and resets the translation cache.

### 7. Wrong vs Correct

#### Wrong

```python
try:
    plugin = ep.load()()
except Exception:
    return []
```

#### Correct

```python
factory = ep.load()
plugin = _instantiate_plugin(source="entry point", name=ep.name, factory_or_plugin=factory)
plugins.append((ep.name, plugin))
```

Plugin load failures must remain visible so startup cannot succeed in a partially broken state.
