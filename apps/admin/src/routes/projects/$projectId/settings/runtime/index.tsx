import { createFileRoute } from "@tanstack/react-router";

import { ProjectRuntimeSettingsPage } from "@/pages/settings/context-settings-pages";

export const Route = createFileRoute("/projects/$projectId/settings/runtime/")({
  staticData: { titleKey: "account:SETTINGS_NAV_PROJECT_RUNTIME" },
  component: ProjectRuntimeSettingsPage,
});
