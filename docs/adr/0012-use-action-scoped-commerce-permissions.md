# Use action-scoped Commerce permissions

Arclayer authorizes Commerce through `commerce.read`, `commerce.catalog.manage`, `commerce.subscriptions.manage`, `commerce.credits.adjust`, `commerce.provider.manage`, and `commerce.events.reconcile`, rather than one `commerce.manage` permission or the legacy super-admin flag. The Instance Owner retains all Commerce authority, while Platform Operators receive only the operation classes delegated through Platform Roles. This allows finance, support, and infrastructure operators to investigate the same commercial domain without giving each role authority over every monetary, entitlement, credential, and reconciliation action.

## Consequences

Every Platform API mutation and Operational Signal resolution checks its exact permission. The Commerce hard cut removes both the router-wide `require_super_admin` dependency and the obsolete plan-change approval queue; direct authorized mutations remain explicit, idempotent, and fully audited.
