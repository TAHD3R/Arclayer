import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/projects/$projectId/settings/deployments/")({
  staticData: { titleKey: "account:SETTINGS_PROJECT_DEPLOYMENTS_TITLE" },
});
