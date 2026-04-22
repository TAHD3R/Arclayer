import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/projects/$projectId/content/domain/")({
  staticData: { titleKey: "nav:NAV_SETTINGS_SITE" },
});
