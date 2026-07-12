import { createFileRoute } from "@tanstack/react-router";

import { SystemObservabilityActivityPage } from "@/pages/system/observability/activity/page";

export const Route = createFileRoute("/system/observability/activity/")({
  staticData: { titleKey: "platform:OBSERVABILITY_ACTIVITY_TITLE" },
  component: SystemObservabilityActivityPage,
});
