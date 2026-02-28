import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/o/$orgId/team/invitations/")({
  staticData: { titleKey: "nav:NAV_SETTINGS_TEAM_MEMBERS" },
});
