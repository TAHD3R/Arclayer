import { createFileRoute } from "@tanstack/react-router";

import { SystemDirectoryWorkspacesPage } from "@/pages/system/directory/workspaces/page";

export const Route = createFileRoute("/system/tenants/workspaces/")({
  staticData: { titleKey: "settings:SETTINGS_SYSTEM_DIRECTORY_TAB_WORKSPACES" },
  component: SystemDirectoryWorkspacesPage,
});
