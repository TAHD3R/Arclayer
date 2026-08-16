# Commerce actions follow the explicit permission set

**Status:** accepted

The Platform Console will authorize Commerce reads and mutations through the existing Commerce Permission Set: `commerce.read`, `commerce.catalog.manage`, `commerce.subscriptions.manage`, `commerce.credits.adjust`, `commerce.provider.manage`, and `commerce.events.reconcile`. The UI will use the same permissions to expose page, toolbar, row, and dialog actions, while the Platform API remains authoritative; no broad `billing.admin` capability will be introduced.

**Consequences**

- Operators see only actions they are allowed to perform.
- Permission-denied states remain explicit when authority changes during an open workflow.
- Navigation, saved views, bulk actions, and dialogs must not leak fields or workflows outside the current permission projection.
