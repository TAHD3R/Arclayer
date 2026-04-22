import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/projects/$projectId/content/general/")({
  staticData: { titleKey: "nav:NAV_SETTINGS_SITE" },
});
