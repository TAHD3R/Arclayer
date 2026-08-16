# Use immutable Plan Revisions

Arclayer separates a stable **Plan** identity from immutable published **Plan Revisions**. Every Revision snapshots the offer's display terms, prices, Credits, refresh policy, Entitlements, and provider Price mappings; every Workspace Subscription, checkout, provider event, period grant, Entitlement decision, and commercial audit identifies one exact Revision. Drafts may be edited before publication, but published Revisions are never updated in place.

## Consequences

Changing a Plan creates and publishes another Revision instead of rewriting active commercial contracts. Existing mutable Plan rows, Subscription foreign keys, and Plan-code-only provider mappings migrate to explicit Revision references, and the legacy in-place Plan upsert is removed. Existing Subscription adoption is governed by ADR-0014.
