import { createFileRoute } from "@tanstack/react-router";

import { SystemSettingsEmailPage } from "@/pages/system/email/page";

export const Route = createFileRoute("/system/email/")({
  staticData: { titleKey: "settings:SETTINGS_SYSTEM_EMAIL_PAGE_TITLE" },
  component: SystemSettingsEmailPage,
});
