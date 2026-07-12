import { createFileRoute } from "@tanstack/react-router";

import { SystemSettingsBillingPage } from "@/pages/system/billing/page";

export const Route = createFileRoute("/system/settings/billing/")({
  staticData: { titleKey: "commerce:SETTINGS_TITLE" },
  component: SystemSettingsBillingPage,
});
