import { createFileRoute } from "@tanstack/react-router";

import { SystemDirectoryOrganizationsPage } from "@/pages/system/directory/organizations/page";

export const Route = createFileRoute("/system/tenants/organizations/")({
  staticData: { titleKey: "settings:SETTINGS_SYSTEM_DIRECTORY_TAB_ORGANIZATIONS" },
  component: SystemDirectoryOrganizationsPage,
});
