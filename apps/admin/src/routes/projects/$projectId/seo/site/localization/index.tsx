import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/projects/$projectId/seo/site/localization/")({
  staticData: { titleKey: "nav:NAV_SETTINGS_LOCALIZATION" },
});
