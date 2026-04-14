import { createFileRoute } from "@tanstack/react-router";

import { SystemSettingsStoragePage } from "@/pages/system/storage/page";

export const Route = createFileRoute("/system/storage/")({
  staticData: { titleKey: "settings:SETTINGS_SYSTEM_STORAGE_PAGE_TITLE" },
  component: SystemSettingsStoragePage,
});
