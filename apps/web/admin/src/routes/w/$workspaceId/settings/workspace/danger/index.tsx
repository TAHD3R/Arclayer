import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/w/$workspaceId/settings/workspace/danger/")({
  staticData: { titleKey: "nav:NAV_SETTINGS_WORKSPACE" },
});
