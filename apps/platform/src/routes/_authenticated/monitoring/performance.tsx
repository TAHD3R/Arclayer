import { createFileRoute } from "@tanstack/react-router";

import { MonitoringPerformancePage } from "@/pages/monitoring-performance";

export type MonitoringPerformanceSearch = {
  q?: string;
  ordering?:
    | "-requests"
    | "-error_rate"
    | "-p95_latency_ms"
    | "-p99_latency_ms"
    | "-avg_latency_ms"
    | "-last_seen_at";
};
export const Route = createFileRoute("/_authenticated/monitoring/performance")({
  validateSearch: (value: Record<string, unknown>): MonitoringPerformanceSearch => ({
    q: typeof value.q === "string" && value.q.trim() ? value.q.trim() : undefined,
    ordering:
      value.ordering === "-requests" ||
      value.ordering === "-error_rate" ||
      value.ordering === "-p95_latency_ms" ||
      value.ordering === "-p99_latency_ms" ||
      value.ordering === "-avg_latency_ms" ||
      value.ordering === "-last_seen_at"
        ? value.ordering
        : undefined,
  }),
  component: () => {
    const search = Route.useSearch();
    const navigate = Route.useNavigate();
    return (
      <MonitoringPerformancePage
        onSearchChange={(next) => void navigate({ search: next, replace: true })}
        search={search}
      />
    );
  },
});
