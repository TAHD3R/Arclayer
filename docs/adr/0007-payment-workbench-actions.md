# Payment workbench keeps evidence append-only

**Status:** accepted

The Payments surface will be a unified, server-backed workbench for transactions, invoices, refunds, Provider events, and payment corrections. It will expose eligible refund requests, failed-event reconciliation retries, and evidence-backed payment corrections with permission, Connector readiness, idempotency, and explicit result states; it will never overwrite or physically delete Provider or ledger evidence.

**Consequences**

- Refunds are actions on eligible transactions, not edits to transaction rows.
- Reconciliation and correction results remain visible in the payment timeline.
- The UI needs clear distinctions between Provider facts, Arclayer projections, and operator corrections.
