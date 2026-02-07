# Admin Plugin Center Refactor (Installed) + Categories + Two-Step Install + Config Tabs

Date: 2026-02-07

## Summary

This plan upgrades the admin "Plugins Center" UX (installed list + install dialog + plugin detail/config entry) to be:

- More product-like (cards, pagination, contextual actions)
- Safer for installation (validate first, show metadata, confirm to install)
- Easier to navigate (category tabs + searchable dropdown)
- Configuration-driven (forms generated from config schema; multi-tab + multi-form)

Confirmed decisions:

- Install flow is two-step and **does not re-upload** the zip on confirmation. Validation returns a short-lived token; confirm installs by token.
- "Uninstall" in this page means **workspace detach** (remove/disable in current workspace, keep global package installed).

---

## Constraints

- No hard-coded user-facing strings in JSX; use i18n keys.
- Forms must use React Hook Form + Zod.
- Backend is async-only; responses must be schema-driven (Pydantic).
- Keep changes simple (KISS/YAGNI), but make contracts stable for future plugins.

---

## Backend Changes

### 1) Plugin Category Support (manifest-level)

Goal: Enable category filtering in the plugin center without requiring a new DB migration.

Changes:

- `apps/api/plugin/manifest.py`
  - Add `PluginMeta.category: str | None`
  - Validate that category is one of the allowed codes (if provided).
- `apps/api/common/constants/plugin.py`
  - Add a stable allowlist of category codes, e.g.:
    - `content_creation`
    - `media_management`
    - `seo_marketing`
    - `system_security`
    - `performance_optimization`
    - `user_interaction`
    - `data_integration`
    - `data_analytics`
- `apps/api/modules/workspaces/plugins_center/schema.py`
  - Add `WorkspacePluginSummary.category: str | None`
- `apps/api/modules/workspaces/plugins_center/service.py`
  - Populate `category` from the manifest (if available).

Plugin manifest update (example):

- `plugins/plugin-oauth-social/plugin.toml`
  - `category = "data_integration"`

### 2) Two-Step Install APIs (validate -> install-validated)

Goal: Upload once, validate package, show metadata, and only then install.

New endpoints (workspace scope):

- `POST /workspaces/{workspace_id}/plugins-center/validate`
  - Input: multipart `file` (+ optional `checksum`)
  - Output: `{ token, sha256, size_bytes, meta }`
- `POST /workspaces/{workspace_id}/plugins-center/install-validated`
  - Input: `{ token, enable_in_workspace }`
  - Output: same as existing install result `{ plugin, requires_restart }`

Implementation notes:

- Store the uploaded zip in a dedicated staging folder under plugin root:
  - `.staging/validate/{token}/package.zip`
- Validation extracts only what's needed to read and validate the manifest.
- Install-by-token re-validates the staged zip (fail closed), then runs the existing install logic.
- Clean up staging directory best-effort on success.

Schemas:

- `PluginPackageMeta` (for frontend `Descriptions`):
  - `plugin_id`, `slug`, `name`, `description`, `author`, `version`, `requires`, `category`
  - `has_config_schema`, `permissions_count`, `models_count`
  - `icon` (optional raw manifest icon reference)
- Validate output:
  - `token`, `sha256`, `size_bytes`, `meta`

Tests:

- Validate success returns token/meta.
- Install-validated consumes token and installs successfully.
- Invalid token/expired token returns a stable error.
- Invalid `category` should fail validation (manifest validation).

---

## Frontend Changes (Admin)

Target page:

- `apps/web/admin/src/pages/plugins/installed/page.tsx`

### 3) DefaultPage action uses Antd Button (with icon)

- Move the install CTA into `DefaultPage.action`.
- Use Antd `Button` with an icon.

### 4) Category Tabs + Search Select (ChromeTabs + Antd Select)

Goal: Allow users to quickly filter plugins by category and search by name.

- Enhance `apps/web/admin/src/components/ui/chrome-tabs.tsx` with a small wrapper that can render:
  - Left: Chrome-like category tabs
  - Right: Antd `Select` with:
    - dropdown options
    - fuzzy search
    - allowClear

i18n:

- Add category names to `locales/*/plugin.json`.

### 5) Card List + More Actions + Pagination

Goal: Plugin list in Antd `Card` layout:

- Icon (from `iconUrl`, fallback icon)
- Name + version tag
- Description
- Switch for enable/disable
- "More" menu:
  - Configure entry
  - Detach from workspace (label should reflect detach semantics)
  - Reset config
- Pagination (client-side for now; page size 12)

Also remove the old hint text:

- Remove the expression meaning "installed globally but enabled per workspace".
- Update `PLUGIN_CENTER_HINT` translations accordingly.

### 6) Two-Step Install Dialog (validate -> descriptions -> confirm)

Goal: Reuse the visual style of the existing asset upload dialog:

- `apps/web/admin/src/components/common/assets/asset-upload-dialog.tsx`

New component:

- `apps/web/admin/src/components/plugins/plugin-install-dialog.tsx`

Behavior:

- Accept only one zip at a time.
- Step 1: Upload & Validate (calls validate API)
- Step 2: Show metadata via Antd `Descriptions`
- Step 3: Confirm Install (calls install-validated API)
- Show error/failed states with clear retry guidance.

Frontend API:

- Extend `apps/web/admin/src/api/workspace-plugins.ts`:
  - `validateWorkspacePluginPackage(...)`
  - `installValidatedWorkspacePlugin(...)`

---

## Plugin Detail / Config Entry

Target route:

- `apps/web/admin/src/routes/w/$workspaceId/plugins/$pluginSlug/index.tsx`

Goal: A config-driven page using `DefaultPage` that supports:

- Details tab (always)
- Config tabs (only if schema exists)
  - Multi-tab + multi-form
  - Section-based forms (one section per tab)
- Each config field supports:
  - options (select) + option description
  - field description

Implementation approach:

- Extend backend manifest schema to support field `options`.
- Extend system settings schema output so the UI can render options.
- Update the form renderer component to support `Select` fields when `options` exists.

---

## Acceptance Criteria

- Installed page header action uses Antd Button with icon.
- Install dialog is two-step, single-file, validate first, shows metadata, confirms install by token.
- Category tabs + searchable dropdown exist and are i18n-driven.
- Plugin list uses Antd Card, shows icon/name/version/description, has enable toggle, and "More" actions.
- Plugin detail page is config-driven with tabs and per-section forms; options + descriptions render correctly.

