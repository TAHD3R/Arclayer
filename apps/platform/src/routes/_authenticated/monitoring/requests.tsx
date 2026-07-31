import { createFileRoute } from "@tanstack/react-router";

import { MonitoringRequestsPage } from "@/pages/monitoring-requests";

export type MonitoringRequestsSearch = {
  q?: string;
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  ordering?: "-occurred_at" | "occurred_at" | "-duration_ms" | "duration_ms" | "-status_code";
  page?: number;
};
export const Route = createFileRoute("/_authenticated/monitoring/requests")({
  validateSearch: (value: Record<string, unknown>): MonitoringRequestsSearch => ({
    q: typeof value.q === "string" && value.q.trim() ? value.q.trim() : undefined,
    method:
      value.method === "GET" ||
      value.method === "POST" ||
      value.method === "PATCH" ||
      value.method === "DELETE"
        ? value.method
        : undefined,
    ordering:
      value.ordering === "-occurred_at" ||
      value.ordering === "occurred_at" ||
      value.ordering === "-duration_ms" ||
      value.ordering === "duration_ms" ||
      value.ordering === "-status_code"
        ? value.ordering
        : undefined,
    page:
      Number.isInteger(Number(value.page)) && Number(value.page) > 0
        ? Number(value.page)
        : undefined,
  }),
  component: () => {
    const search = Route.useSearch();
    const navigate = Route.useNavigate();
    return (
      <MonitoringRequestsPage
        onSearchChange={(next) => void navigate({ search: next, replace: true })}
        search={search}
      />
    );
  },
});
