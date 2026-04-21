import { createFileRoute } from "@tanstack/react-router";

import { SystemDirectoryUsersPage } from "@/pages/system/directory/users/page";

export const Route = createFileRoute("/system/tenants/users/")({
  staticData: { titleKey: "settings:SETTINGS_SYSTEM_DIRECTORY_TAB_USERS" },
  component: SystemDirectoryUsersPage,
});
