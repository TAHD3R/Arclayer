# Commerce and System Settings redesign decisions

**Status:** accepted

This redesign treats Platform Commerce as a lifecycle-management workbench and introduces a separate System Settings domain at `/settings`. Commerce pages provide complete operator workflows without mechanical CRUD: published Plan Revisions and payment evidence remain immutable/append-only, Subscription changes use explicit transitions or single-Workspace corrections, Credits are managed from Workspaces, and all writes are single-record, permission-aware, idempotent, revision-checked, and audited. System Settings owns only cross-domain deployment configuration—instance identity, domain defaults, language catalog metadata, regional/display defaults, SEO defaults, and other unowned global behavior—while Access, AI, Hosting, Messages, Extensions, Capability Catalog, and Commerce retain their own configuration authority.

## Accepted product and interaction decisions

- Commerce navigation is “Plans & billing” / “套餐与账单” with Subscriptions, Plans, Payments, and Configuration. Existing `/billing/...` URLs remain stable; `/billing/credits` leaves top-level navigation and its workflow moves into Workspaces.
- Commerce uses the explicit permission set: `commerce.read`, `commerce.catalog.manage`, `commerce.subscriptions.manage`, `commerce.credits.adjust`, `commerce.provider.manage`, and `commerce.events.reconcile`. No broad billing-admin permission is introduced.
- All list pages use a server-backed DataTable with URL-reproducible search, filters, sorting, pagination, visible-column and column-order controls, refresh, and personal Saved views where supported. Row activation opens an investigative Drawer that preserves list context.
- The shared PageHeader contract provides `extra`, secondary actions, and one primary action slot. Page-level actions live there; form work opens in Dialog or Drawer surfaces.
- Visual direction is the Operations Workbench: quiet neutral surfaces, dense readable tables, semantic badges, and no card mosaics or decorative layout tricks.
- Plans use structured localized product text (`zh-CN` and `en-US`), pricing, billing cycles, Credits, Entitlements, resource allowances, and references to ready Connector capabilities/provider price mappings. Connector installation/readiness remains in Commerce Configuration.
- Subscriptions expose renewal-time transition preview/schedule, cancellation at period end, eligible transition cancellation, and evidenced immediate Commercial Correction. No generic immediate plan switch or physical delete.
- Payments expose transactions, invoices, refunds, Provider events, reconciliation retry, eligible full-refund request, and append-only payment correction. Original evidence is never overwritten or deleted.
- Commerce Configuration owns Provider/Connector readiness, Payment Recovery/Dunning, and Commerce catalog rules through real persisted APIs, revisions, and Audit evidence. Other domains are linked/projection-only.
- No generic bulk write actions are included in this rollout.
- System Settings uses `/settings`, its own `platform:system-settings:read/manage` permissions, and grouped configuration panels. Small edits use Dialogs; large/high-risk edits use Drawers; Language Catalog uses the standard DataTable.
- The Language Catalog manages supported locale metadata, enabled/default state, order, and flag presentation. Changes use draft → impact review → publish. Disabling the current/default locale requires an explicit replacement and never silently falls back. Translation text remains versioned/validated resource bundles rather than arbitrary key-value editing.
- Country flags are presentation metadata only: each locale stores an explicit region/flag code and accessible language labels; language identity is not inferred from a browser locale or flag alone.

## Architectural consequences

- Existing key-only Plan copy contracts must be extended or adapted so operator-facing forms never expose i18n implementation keys.
- Existing static Platform locale imports must gain a shared, server-backed Language Catalog interface with safe bootstrap behavior, revisioning, and cache invalidation while preserving the repository’s no-fallback missing-key contract.
- The legacy `core` settings schema requires an ownership migration matrix; duplicate forms and split sources of truth are not allowed.
