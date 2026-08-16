# Credits are managed from the Workspace context

**Status:** accepted

Credit balances and adjustments remain owned by the Commerce Platform Domain, but the Platform Console will expose them from the Workspaces operational directory rather than as a standalone `/billing/credits` page. A Workspace row or Drawer can open its credit state and, for operators with `commerce.credits.adjust`, the existing audited adjustment workflow; the duplicated top-level Credits route and navigation entry are removed.

**Consequences**

- Credit actions always carry an explicit Workspace context.
- The Workspaces directory needs a permission-aware credit summary and Drawer action.
- Commerce API and ledger contracts remain canonical; the Workspaces surface does not fork credit logic.
