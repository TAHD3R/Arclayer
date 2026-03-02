# Deployment Scope Gating (Admin UI)

This document defines how the Admin frontend should hide or block features based on the deployment
mode (SaaS vs. Self-host), and how to prevent URL-based access to out-of-scope pages.

## Definitions

- **Deployment mode**: a runtime value returned by `GET /system/runtime`.
  - `"saas"`: multi-tenant hosted deployment.
  - `"self_host"`: self-hosted deployment.
- **Deployment scope**: where a feature is allowed to appear.
  - `"saas" | "self_host" | "both"` (default: `"both"`).

## Golden Rules

1. **UI gating is not security**: hiding a button or a menu item does not prevent URL access.
2. **Route guards are mandatory for security-sensitive boundaries**:
   use `beforeLoad` and throw `notFound()` when the scope is not satisfied.
3. **Default to SaaS-safe behavior when runtime probing fails**:
   features that should be self-host only must stay hidden unless explicitly enabled.

## Navigation (Menu) Scope

### When to use

Use menu scope to avoid mounting menu items that are out of scope for the current deployment
mode.

### How it works

- `AdminNavItem` supports `scope?: DeploymentScope` (default is `"both"`).
- `AdminLayout` filters nav items by deployment mode via `filterNavByScope(...)`.

### Example

```ts
{
  key: "settings.snapshots",
  to: "/settings/maintenance/snapshots",
  labelKey: "nav:NAV_SETTINGS_MAINTENANCE_SNAPSHOTS",
  scope: "self_host",
}
```

## Route Guards (Prevent URL Bypass)

### When to use

Use route guards for any route that must not be accessible by typing a URL directly.

### How to implement

In `src/routes/**/index.tsx`, add `beforeLoad`:

```ts
import { requireDeploymentScope } from "@/lib/system/runtime-guards";

export const Route = createFileRoute("/w/$workspaceId/settings/maintenance/snapshots/")({
  beforeLoad: async () => {
    await requireDeploymentScope("self_host");
  },
});
```

### Notes

- Route guards must not depend on React hooks.
- Route guards should fail closed: when runtime probing fails, treat as `"saas"` and keep
  self-host-only pages blocked.

## Component-level Gating

### When to use

Use component gating for non-security-sensitive UI (e.g. buttons, tabs, small sections),
especially when a route itself remains valid but some sub-feature is not.

### How to implement

Use `FeatureGate`:

```tsx
import { FeatureGate } from "@/components/common/feature-gate";

<FeatureGate scope="saas" fallback={null}>
  <BillingCTA />
</FeatureGate>;
```

### Reminder

`FeatureGate` is **UI-only**. If the feature has a dedicated route, add a `beforeLoad`
guard as well.
