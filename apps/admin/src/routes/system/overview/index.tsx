import { createFileRoute } from "@tanstack/react-router";

import { SystemPlatformOverviewPage } from "@/pages/system/overview/page";

export const Route = createFileRoute("/system/overview/")({
  staticData: { titleKey: "platform:OVERVIEW_TITLE" },
  component: SystemPlatformOverviewPage,
});
