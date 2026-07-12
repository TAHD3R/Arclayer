import { createFileRoute } from "@tanstack/react-router";

import { SystemObservabilityAIUsagePage } from "@/pages/system/observability/ai-usage/page";

export const Route = createFileRoute("/system/observability/ai-usage/")({
  staticData: { titleKey: "platform:OBSERVABILITY_AI_TITLE" },
  component: SystemObservabilityAIUsagePage,
});
