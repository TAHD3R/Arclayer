# Commerce lifecycle management instead of mechanical CRUD

**Status:** accepted

The Platform Console's Commerce surfaces will provide complete lifecycle management, while preserving the domain's immutable and append-only records. Plans can be created and archived; Plan Revisions can be drafted, edited, published, and retired before/after selling as allowed; Subscriptions use explicit transitions, cancellation, and single-Workspace corrections; Payments and Credits preserve original evidence and expose reconciliation or append-only adjustments instead of overwrite or physical deletion. This keeps operator workflows complete without violating Plan Revision immutability, Subscription revision pinning, or auditability.

**Considered Options**

- Mechanical CRUD for every row, including overwriting or deleting published revisions, subscriptions, and payment evidence.
- Lifecycle-specific management with explicit transition and correction actions.

**Consequences**

- UI actions and copy must describe the real outcome (publish, retire, schedule, reconcile, correct) rather than generic Edit/Delete labels.
- Some requested operations require server-backed preview, idempotency, expected-revision checks, and audit evidence.
