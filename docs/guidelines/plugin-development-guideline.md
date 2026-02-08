# Plugin Development Guideline (CelestialCMS)

This document defines mandatory rules for designing, implementing, packaging, and operating plugins in CelestialCMS.
It is a full-stack guideline: backend runtime is the source of truth, and Admin/Portal extension contracts are included.

## 1. Goals

- Keep plugin behavior predictable and reviewable across teams.
- Prevent capability drift in manifest, permissions, routes, events, and config.
- Keep plugin upgrades safe by enforcing compatibility and security boundaries.
- Make plugin UI extensions consistent with platform contracts.

## 2. Scope

This guideline applies to:

- Plugin runtime and host components under `apps/api/plugin/*`.
- Plugin management/install flow under `apps/api/modules/system/plugins_manager/*`.
- Plugin runtime settings and secret handling under `apps/api/settings/*`.
- Plugin locale resources under `plugins/<plugin_id>/locales/<locale>/*.json`.
- Admin/Portal extension declarations from plugin manifests (`admin_menu`, `admin_ui_extensions`, `portal_extensions`).

## 3. Plugin Package and File Layout

## 3.1 Required files

Each plugin package must include:

- `plugin.toml` (manifest, required)
- Entrypoint module declared by `plugin.entrypoint` (required)

## 3.2 Optional files

Optional but strongly recommended files:

- `routers.py` exporting `public_router` and/or `admin_router`
- `locales/<locale>/*.json` for plugin-owned UI text and errors
- Additional modules used by entrypoint/router/hooks

## 3.3 Packaging constraints

- Plugin package must be a valid zip archive.
- Package extraction must remain within plugin root (no path traversal, no symlink extraction).
- Package file count and size limits must follow runtime settings.

## 4. Manifest Contract (`plugin.toml`)

Manifest schema is validated by `apps/api/plugin/manifest.py`. The following contracts are mandatory.

## 4.1 Core metadata (`[plugin]`)

- `id`: lowercase kebab-case, stable, globally unique in the deployment.
- `slug`: lowercase kebab-case, stable, used in route prefixes.
- `version`: semantic plugin version string.
- `requires`: app compatibility spec.
- `entrypoint`: `<module>:<ClassName>`; class must extend `BasePlugin`.
- `management_scope`: `workspace` or `organization`.

Additional metadata (`name`, `description`, `author`, `website`, `repository`, `issues`, `license`, `category`, `icon`) should remain stable and user-meaningful.

## 4.2 Reserved and validation rules

- Reserved IDs are forbidden (for example `core`, `.staging`, `.backup`, `.cache`).
- Invalid `id`, `slug`, `management_scope`, or `category` is a hard validation failure.
- Manifest validation errors must map to stable error codes in API responses.

## 4.3 Dependency declarations (`dependencies`)

- Use plugin IDs as dependency references.
- Use PEP 440-compatible version specifiers when version constraints are needed.
- Mark non-critical dependencies as `optional=true`.
- Required dependency mismatch/missing state must block start/enable.

## 4.4 Permission declarations (`permissions`)

- Declare permission templates in manifest; do not rely on implicit permissions.
- Permission code must be unique and namespaced by plugin intent.
- `scope` must align with plugin management scope semantics.
- `default_roles` must follow least-privilege defaults.

## 4.5 Config schema (`config_schema`)

- Use section/field schema structure; keep keys stable after release.
- Field `type` must be explicit and validated (`str/int/float/bool/list/dict`).
- Use `options` for controlled values in UI-facing config.
- Mark sensitive fields with `secret=true`.

## 4.6 Extension declarations

- `admin_menu`: declarative menu seeds only; avoid embedding business logic.
- `admin_ui_extensions`: stable `id`, clear `slot`, explicit `kind`, optional `permission_code`.
- `portal_extensions`: stable `id`, explicit `kind`, optional `permission_code`.

Breaking changes in extension IDs/slots require migration notes and compatibility review.

## 5. Runtime Lifecycle and State

## 5.1 Discovery and record sync

- Runtime discovers manifests from plugin root and builds descriptors.
- Discovery must fail on slug collisions.
- Plugin record sync must persist manifest-derived metadata and merged default config.

## 5.2 Start/stop rules

- Start order must respect declared dependencies.
- Disabled plugins are not started.
- Failed dependency validation sets plugin status to `FAILED` and blocks startup.
- Stop flow must clean up registrations and event subscriptions.

## 5.3 Enable/disable rules

- Enabling a plugin must ensure required dependencies are enabled first.
- Disabling must block when active dependents exist.
- Lifecycle operations should emit stable plugin events (`plugin.enabled`, `plugin.disabled`, etc.).

## 5.4 Restart and migration behavior

- Plugins declaring `models` are restart-sensitive.
- Auto-migration behavior is controlled by plugin settings and runtime environment.
- Migration lock behavior must remain concurrency-safe when Valkey is available.
- Restart requests should be explicit and auditable.

## 6. Route Injection Contract

## 6.1 Router export convention

When plugin routes are provided, `routers.py` should export:

- `public_router` (`APIRouter`, optional)
- `admin_router` (`APIRouter`, optional)

## 6.2 URL prefix rules

- Public routes: `/plugins/{slug}/...`
- Admin routes: `/workspaces/{workspace_id}/plugins/{slug}/...`

`slug` is the manifest slug and must remain stable once released.

## 6.3 Access control requirements

- All injected plugin routes must pass `require_plugin_enabled(...)` checks.
- Admin plugin routes additionally require workspace manage access and admin access permission.
- Plugin runtime must fail closed when plugin state checks cannot be loaded.

## 7. Event Contract and Naming

## 7.1 Event envelope

Use `apps/api/plugin/event_bus.py::Event` contract:

- `name`, `payload`, `version`, `occurred_at`, `source`, `trace_id`, `actor_user_id`

## 7.2 Naming convention (mandatory)

- Use lowercase dot-separated names: `<domain>.<entity>.<action>`.
- Keep names stable once public/consumed.
- Reuse existing core event constants when applicable (for example `plugin.installed`).

## 7.3 Payload constraints

- Payload should contain minimal identifiers and context, not large objects.
- Do not put secrets/tokens/passwords or raw sensitive content in payload.
- For incompatible payload changes, bump event `version` and provide migration notes.

## 7.4 Reliability and error handling

- `publish` is fire-and-forget by default; handlers must be idempotent and non-blocking.
- Handler failures must be logged with context and must not crash request flows.
- Slow handler behavior should be observable and improved before release.

## 8. i18n for Plugins

- Plugin text resources must be stored in plugin-local `locales/<locale>/*.json`.
- User-visible text should use i18n references (`namespace:key`) in manifest where supported.
- `zh-CN` and `en-US` must be updated in the same change.
- Avoid overriding core namespaces unless override intent is documented.

## 9. Configuration and Secret Handling

- Plugin config updates must be validated against manifest `config_schema`.
- Unknown keys should only be preserved when policy allows and behavior is explicit.
- Secret fields must be encrypted at rest and decrypted only in-memory when required.
- Decryption failures must fail closed (return `None`/safe fallback), not leak encrypted blobs as plaintext.
- Do not log secret values during validation, update, or runtime resolution.

## 10. Security Boundaries

- Plugin code runs in-process and must be treated as trusted code with strict review.
- Never bypass host checks by direct DB mutation in plugin lifecycle logic.
- Plugin routes must not expose internal raw UUIDs in external contracts.
- Installation/update/uninstall operations must be rollback-aware and auditable.

## 11. Admin/Portal Integration Rules

- Extension declarations are contracts, not ad-hoc runtime patches.
- `title_i18n` should be preferred for user-facing extension text.
- `permission_code` should gate visibility and actions consistently.
- If both Admin and Portal consume the same contract/type, promote it to shared `packages/*` instead of duplicating.

## 12. Testing and Validation Requirements

Minimum plugin-related verification should include:

- Manifest validation (valid/invalid cases)
- Dependency resolution (missing/version mismatch/cycle)
- Route injection and access control behavior
- Event naming and payload safety checks
- Config schema validation and secret encryption/decryption behavior
- Install package safety checks (zip format/path traversal/symlink/size limits)

## 13. Plugin PR Checklist

- [ ] Manifest fields are valid and stable (`id`, `slug`, `entrypoint`, `requires`, `scope`).
- [ ] Dependency and version constraints are declared and validated.
- [ ] Permissions are explicitly declared and least-privilege by default.
- [ ] Route exports and prefixes follow platform conventions.
- [ ] Plugin state guards are enforced on injected routes.
- [ ] Event names/payloads follow naming and sensitivity rules.
- [ ] Config schema is validated; secret fields are encrypted at rest.
- [ ] i18n resources include both `zh-CN` and `en-US`.
- [ ] Admin/Portal extension declarations remain backward compatible or include migration notes.
- [ ] Installation safety constraints and rollback behavior are verified.

## 14. Anti-Patterns

- Using unstable IDs/slugs after initial release.
- Relying on implicit permissions without manifest declarations.
- Embedding secrets in manifest defaults or event payloads.
- Bypassing route/state guards for plugin endpoints.
- Shipping plugin packages without safety validation or compatibility review.
