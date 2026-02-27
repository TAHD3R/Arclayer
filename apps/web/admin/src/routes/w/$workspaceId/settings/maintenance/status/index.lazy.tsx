import { createLazyFileRoute } from "@tanstack/react-router";

import { PlaceholderPage } from "@/pages/placeholder/page";

export const Route = createLazyFileRoute("/w/$workspaceId/settings/maintenance/status/")({
  component: StatusPlaceholder,
});

function StatusPlaceholder() {
  return <PlaceholderPage titleKey="nav:NAV_SETTINGS_MAINTENANCE_STATUS" />;
}
