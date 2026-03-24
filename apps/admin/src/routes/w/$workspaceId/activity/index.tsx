import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/w/$workspaceId/activity/")({
  staticData: { titleKey: "nav:NAV_SETTINGS_MAINTENANCE_ACTIVITY" },
});
