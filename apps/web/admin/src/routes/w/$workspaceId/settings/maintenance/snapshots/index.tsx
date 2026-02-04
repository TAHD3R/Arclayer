import { createFileRoute } from "@tanstack/react-router";

import { PlaceholderView } from "@/pages/placeholder/page";

export const Route = createFileRoute("/w/$workspaceId/settings/maintenance/snapshots/")({
  component: () => <PlaceholderView titleKey="nav:NAV_SETTINGS_MAINTENANCE_SNAPSHOTS" />,
});
