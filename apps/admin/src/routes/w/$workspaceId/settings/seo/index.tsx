import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/w/$workspaceId/settings/seo/")({
  staticData: { titleKey: "nav:NAV_SETTINGS_SEO" },
});
