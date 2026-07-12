import { createFileRoute } from "@tanstack/react-router";

import { SystemObservabilityRequestsPage } from "@/pages/system/observability/requests/page";

export const Route = createFileRoute("/system/observability/requests/")({
  staticData: { titleKey: "platform:OBSERVABILITY_REQUESTS_TITLE" },
  component: SystemObservabilityRequestsPage,
});
