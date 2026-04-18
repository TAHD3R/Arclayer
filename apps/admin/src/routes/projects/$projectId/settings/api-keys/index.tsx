import { createFileRoute } from "@tanstack/react-router";

import { ProjectApiKeysSettingsPage } from "@/pages/settings/context-settings-pages";

export const Route = createFileRoute("/projects/$projectId/settings/api-keys/")({
  staticData: { titleKey: "account:SETTINGS_NAV_PROJECT_API_KEYS" },
  component: ProjectApiKeysSettingsPage,
});
