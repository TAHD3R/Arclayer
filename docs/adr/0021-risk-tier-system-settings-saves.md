# Use risk-tiered saves for System Settings

**Status:** accepted

System Settings does not use one monolithic publish action. Low-risk fields save within their group after server confirmation; medium-risk fields save as drafts and apply explicitly; high-impact fields require impact preview, consequence review, reason, revision/idempotency checks, and action-bound verification when classified. Language Catalog retains its dedicated draft → impact review → publish lifecycle.

**Consequences**

- Every group reports whether its value is draft, effective, pending, conflicted, or unavailable.
- The PageHeader primary action changes meaning by the current group and risk tier, with plain localized copy.
- A setting is never shown as applied before the owning Platform API confirms the persisted result.
