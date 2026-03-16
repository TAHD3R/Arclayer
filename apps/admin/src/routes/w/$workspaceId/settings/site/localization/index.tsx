import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/w/$workspaceId/settings/site/localization/")({
  staticData: { titleKey: "nav:NAV_SETTINGS_SITE" },
});
