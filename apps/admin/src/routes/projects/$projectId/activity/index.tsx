import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/projects/$projectId/activity/")({
  staticData: { titleKey: "nav:NAV_SETTINGS_MAINTENANCE_ACTIVITY" },
});
