import { createFileRoute } from "@tanstack/react-router";

import { SystemObservabilityAIUsagePage } from "@/pages/system/observability/ai-usage/page";
import type { ObservabilityPeriodDays } from "@/pages/system/observability/components/period-select";

const PERIODS: readonly ObservabilityPeriodDays[] = new Set([7, 14, 30, 90]);

type AIUsageSearch = { days?: ObservabilityPeriodDays };

function SystemObservabilityAIUsageRoute() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const days = search.days ?? 30;
  return (
    <SystemObservabilityAIUsagePage
      days={days}
      onDaysChange={(nextDays) =>
        void navigate({
          search: { days: nextDays === 30 ? undefined : nextDays },
          replace: true,
        })
      }
    />
  );
}

export const Route = createFileRoute("/system/observability/ai-usage/")({
  staticData: { titleKey: "platform:OBSERVABILITY_AI_TITLE" },
  validateSearch: (search: Record<string, unknown>): AIUsageSearch => {
    const days = Number(search.days);
    return PERIODS.has(days as ObservabilityPeriodDays)
      ? { days: days as ObservabilityPeriodDays }
      : {};
  },
  component: SystemObservabilityAIUsageRoute,
});
