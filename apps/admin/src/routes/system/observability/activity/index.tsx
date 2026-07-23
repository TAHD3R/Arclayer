import { createFileRoute } from "@tanstack/react-router";

import { SystemObservabilityActivityPage } from "@/pages/system/observability/activity/page";
import type { ObservabilityPeriodDays } from "@/pages/system/observability/components/period-select";

const PERIODS: readonly ObservabilityPeriodDays[] = new Set([7, 14, 30, 90]);

type ActivitySearch = { days?: ObservabilityPeriodDays };

function SystemObservabilityActivityRoute() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const days = search.days ?? 30;
  return (
    <SystemObservabilityActivityPage
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

export const Route = createFileRoute("/system/observability/activity/")({
  staticData: { titleKey: "platform:OBSERVABILITY_ACTIVITY_TITLE" },
  validateSearch: (search: Record<string, unknown>): ActivitySearch => {
    const days = Number(search.days);
    return PERIODS.has(days as ObservabilityPeriodDays)
      ? { days: days as ObservabilityPeriodDays }
      : {};
  },
  component: SystemObservabilityActivityRoute,
});
