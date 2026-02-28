import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/o/$orgId/team/roles/")({
  staticData: { titleKey: "nav:NAV_SETTINGS_TEAM_ROLES" },
});
