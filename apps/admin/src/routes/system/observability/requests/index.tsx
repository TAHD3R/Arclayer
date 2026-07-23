import { createFileRoute } from "@tanstack/react-router";

import { SystemObservabilityRequestsPage } from "@/pages/system/observability/requests/page";
import type { ObservabilityPeriodDays } from "@/pages/system/observability/components/period-select";

const PERIODS: readonly ObservabilityPeriodDays[] = new Set([7, 14, 30, 90]);

type RequestsSearch = { days?: ObservabilityPeriodDays };

function SystemObservabilityRequestsRoute() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const days = search.days ?? 30;
  return (
    <SystemObservabilityRequestsPage
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

export const Route = createFileRoute("/system/observability/requests/")({
  staticData: { titleKey: "platform:OBSERVABILITY_REQUESTS_TITLE" },
  validateSearch: (search: Record<string, unknown>): RequestsSearch => {
    const days = Number(search.days);
    return PERIODS.has(days as ObservabilityPeriodDays)
      ? { days: days as ObservabilityPeriodDays }
      : {};
  },
  component: SystemObservabilityRequestsRoute,
});
