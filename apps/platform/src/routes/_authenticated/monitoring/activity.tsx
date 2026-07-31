import { createFileRoute } from "@tanstack/react-router";

import { MonitoringActivityPage } from "@/pages/monitoring-activity";

export const Route = createFileRoute("/_authenticated/monitoring/activity")({
  component: MonitoringActivityPage,
});
