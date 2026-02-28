import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/w/$workspaceId/settings/general/site/")({
  staticData: { titleKey: "nav:NAV_SETTINGS_GENERAL" },
});
