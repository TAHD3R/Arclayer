import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/w/$workspaceId/team/invitations/")({
  staticData: { titleKey: "nav:NAV_SETTINGS_TEAM_MEMBERS" },
});
