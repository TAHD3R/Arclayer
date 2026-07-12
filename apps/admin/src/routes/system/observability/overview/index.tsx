import { createFileRoute } from "@tanstack/react-router";

import { SystemObservabilityOverviewPage } from "@/pages/system/observability/overview/page";

export const Route = createFileRoute("/system/observability/overview/")({
  staticData: { titleKey: "platform:OBSERVABILITY_OVERVIEW_TITLE" },
  component: SystemObservabilityOverviewPage,
});
