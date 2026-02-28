import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/w/$workspaceId/settings/maintenance/activity/")({
  staticData: { titleKey: "nav:NAV_SETTINGS_MAINTENANCE_ACTIVITY" },
});
