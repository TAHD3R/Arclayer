# Standardize Platform PageHeader and operational DataTables

**Status:** accepted

Platform operational pages will use one canonical PageHeader contract with `extra`, a primary-action slot, and secondary-action slots. Page-level create, refresh, view, and configuration entry points belong in that header; forms open in Dialog or Drawer surfaces. Commerce list pages will use the same server-backed DataTable contract with URL-reproducible query state, column visibility/order controls, refresh, row Drawers, and personal Saved views where the owning domain supports them.

**Consequences**

- Existing `PlatformPage` header behavior is the implementation starting point because it already accepts `primaryAction`, `secondaryActions`, and `extra` ([apps/platform/src/components/platform-page.tsx](../../apps/platform/src/components/platform-page.tsx)).
- Page-local action bars and free-floating primary buttons should be removed as Commerce pages are redesigned.
- DataTable state, permissions, and server query schemas must remain aligned; the frontend must not emulate full result sets locally.
