# Subscription management uses explicit transitions and corrections

**Status:** accepted

Platform subscription management will expose auditable lifecycle actions rather than a generic mutable Plan field. Renewal-time changes use a server preview and scheduled Subscription Revision Transition; cancellation applies at the period boundary; scheduled transitions can be cancelled when eligible; an immediate single-Workspace change is a separately evidenced Commercial Correction. Platform Operators never impersonate the Workspace to submit tenant payment or portal actions.

**Consequences**

- The subscription Drawer must show current and scheduled state, effective dates, and impact before actions.
- High-risk changes use revision checks, idempotency, reason/evidence, and explicit result states.
- There is no physical delete or silent immediate plan switch in the UI.
