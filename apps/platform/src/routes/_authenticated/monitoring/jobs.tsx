import { createFileRoute } from "@tanstack/react-router";

import { MonitoringJobsPage } from "@/pages/monitoring-jobs";

export type MonitoringJobsSearch = {
  status?: string;
  workload?: string;
  page?: number;
};

export const Route = createFileRoute("/_authenticated/monitoring/jobs")({
  validateSearch: (value: Record<string, unknown>): MonitoringJobsSearch => ({
    status:
      typeof value.status === "string" && value.status.trim() ? value.status.trim() : undefined,
    workload:
      typeof value.workload === "string" && value.workload.trim()
        ? value.workload.trim()
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
      <MonitoringJobsPage
        onSearchChange={(next) => void navigate({ search: next, replace: true })}
        search={search}
      />
    );
  },
});
