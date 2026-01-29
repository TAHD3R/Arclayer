import { createFileRoute } from "@tanstack/react-router";

import { PlaceholderView } from "@/views/PlaceholderView";

export const Route = createFileRoute("/settings/maintenance/audit-log/")({
  component: () => <PlaceholderView titleKey="nav:NAV_SETTINGS_MAINTENANCE_AUDIT_LOG" />,
});
