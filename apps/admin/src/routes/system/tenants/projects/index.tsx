import { createFileRoute } from "@tanstack/react-router";

import { SystemDirectoryProjectsPage } from "@/pages/system/directory/projects/page";

export const Route = createFileRoute("/system/tenants/projects/")({
  staticData: { titleKey: "settings:SETTINGS_SYSTEM_DIRECTORY_TAB_PROJECTS" },
  component: SystemDirectoryProjectsPage,
});
