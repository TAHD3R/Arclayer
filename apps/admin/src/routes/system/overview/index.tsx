import { createFileRoute } from "@tanstack/react-router";

import { SystemPlatformOverviewPage } from "@/pages/system/overview/page";
import type { ObservabilityPeriodDays } from "@/pages/system/observability/components/period-select";

const PERIODS: readonly ObservabilityPeriodDays[] = new Set([7, 14, 30, 90]);

type SystemOverviewSearch = {
  days?: ObservabilityPeriodDays;
};

function SystemOverviewRoute() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const days = search.days ?? 30;
  return (
    <SystemPlatformOverviewPage
      days={days}
      onDaysChange={(nextDays) =>
        void navigate({
          search: (current) => ({ ...current, days: nextDays === 30 ? undefined : nextDays }),
          replace: true,
        })
      }
    />
  );
}

export const Route = createFileRoute("/system/overview/")({
  staticData: { titleKey: "platform:OVERVIEW_TITLE" },
  validateSearch: (search: Record<string, unknown>): SystemOverviewSearch => {
    const days = Number(search.days);
    return PERIODS.has(days as ObservabilityPeriodDays)
      ? { days: days as ObservabilityPeriodDays }
      : {};
  },
  component: SystemOverviewRoute,
});
