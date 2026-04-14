import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/w/$workspaceId/team/")({
  staticData: { titleKey: "nav:NAV_SETTINGS_TEAM" },
});
