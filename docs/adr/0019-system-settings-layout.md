# Use grouped configuration panels for System Settings

**Status:** accepted

System Settings will use a PageHeader-led layout with grouped navigation and independent configuration panels. Small edits open in Dialogs, larger or higher-risk edits open in Drawers, and Language Catalog uses the standard server-backed DataTable; the page does not submit one monolithic form.

**Consequences**

- Each group can expose its own readiness, revision, permissions, and save/publish state.
- PageHeader actions remain consistent with Commerce and other Platform domains.
- Narrow layouts collapse the group navigation into a Sheet without changing the information architecture.
