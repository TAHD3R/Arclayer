import { createFileRoute } from "@tanstack/react-router";

import { PlaceholderView } from "@/views/PlaceholderView";

export const Route = createFileRoute("/settings/maintenance/snapshots/")({
  component: () => <PlaceholderView titleKey="common:NAV_SETTINGS_MAINTENANCE_SNAPSHOTS" />,
});
