import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/projects/$projectId/settings/environments/")({
  staticData: { titleKey: "nav:NAV_PROJECT_ENVIRONMENTS" },
});
