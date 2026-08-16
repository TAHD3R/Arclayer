# Keep Commerce write actions single-record

**Status:** accepted

The Commerce redesign will not add generic bulk write actions. Subscription transitions and corrections, payment refunds/reconciliation/corrections, Credit adjustments, and Plan or Revision lifecycle changes remain single-record operations with their own preview, idempotency, conflict, and Audit contracts. Tables may query across pages and Workspaces, but selection never silently becomes an all-matching mutation.

**Consequences**

- High-risk operator work stays attributable and reviewable.
- DataTable selection is reserved for navigation or future domain-specific actions with an explicit contract.
- Any later bulk operation must be introduced as a separate domain decision, not inferred from table behavior.
