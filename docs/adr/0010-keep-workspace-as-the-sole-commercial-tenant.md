# Keep Workspace as the sole commercial tenant

Arclayer treats each **Workspace** as the only **Commercial Tenant** and therefore as the sole owner of its Plan, Subscription, Credits, Entitlements, and Usage. An **Organization** may group Workspaces for account-level governance, but it cannot own, pool, inherit, or override their commercial state. This keeps one commercial authority aligned with the existing Workspace administration experience and commerce model, and matches the Workspace-plan and shared-credit model used by closely comparable AI builders such as Lovable and Base44.

## Considered options

- **Organization-only commercial ownership** was rejected because it moves commercial authority away from the collaboration boundary where members, projects, customization, usage, and plan management already live.
- **Organization and Workspace commercial ownership together** was rejected because it creates competing subscriptions, balances, and entitlement authorities and restores the ambiguity removed by the previous hard cut.

## Consequences

Future enterprise procurement may aggregate invoices or payments across Workspace subscriptions as a read model, but it must not introduce Organization-owned Credits or Entitlements.
