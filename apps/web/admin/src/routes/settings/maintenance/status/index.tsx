import { createFileRoute } from "@tanstack/react-router";

import { PlaceholderView } from "@/pages/placeholder/page";

export const Route = createFileRoute("/settings/maintenance/status/")({
  component: () => <PlaceholderView titleKey="nav:NAV_SETTINGS_MAINTENANCE_STATUS" />,
});
