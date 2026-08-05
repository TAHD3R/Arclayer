import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/projects/$projectId/settings/databases/")({
  staticData: { titleKey: "nav:NAV_PROJECT_DATABASES" },
});
