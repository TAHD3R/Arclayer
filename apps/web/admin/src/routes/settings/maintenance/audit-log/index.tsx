import { createFileRoute } from "@tanstack/react-router";

import { PlaceholderView } from "@/pages/placeholder/page";

export const Route = createFileRoute("/settings/maintenance/audit-log/")({
  component: () => <PlaceholderView titleKey="nav:NAV_SETTINGS_MAINTENANCE_AUDIT_LOG" />,
});
