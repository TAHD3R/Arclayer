import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/w/$workspaceId/settings/workspace/collaboration/")({
  staticData: { titleKey: "nav:NAV_SETTINGS_WORKSPACE" },
});
