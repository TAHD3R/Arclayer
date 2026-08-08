import { createFileRoute } from "@tanstack/react-router";

import { MonitoringAiUsagePage } from "@/pages/monitoring-ai-usage";

export type MonitoringAiUsageSearch = {
  q?: string;
  provider?: string;
  workspaceId?: string;
  projectId?: string;
  startDate?: string;
  endDate?: string;
  status?: string;
  source?: string;
  errorCode?: string;
  days?: 7 | 30 | 90;
  page?: number;
};

export function validateMonitoringAiUsageSearch(
  value: Record<string, unknown>,
): MonitoringAiUsageSearch {
  return {
    q: typeof value.q === "string" && value.q.trim() ? value.q.trim() : undefined,
    provider:
      typeof value.provider === "string" && value.provider.trim()
        ? value.provider.trim()
        : undefined,
    workspaceId:
      typeof value.workspaceId === "string" && value.workspaceId.trim()
        ? value.workspaceId.trim()
        : undefined,
    projectId:
      typeof value.projectId === "string" && value.projectId.trim()
        ? value.projectId.trim()
        : undefined,
    startDate:
      typeof value.startDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.startDate)
        ? value.startDate
        : undefined,
    endDate:
      typeof value.endDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.endDate)
        ? value.endDate
        : undefined,
    status:
      typeof value.status === "string" && value.status.trim() ? value.status.trim() : undefined,
    source:
      typeof value.source === "string" && value.source.trim() ? value.source.trim() : undefined,
    errorCode:
      typeof value.errorCode === "string" && value.errorCode.trim()
        ? value.errorCode.trim()
        : undefined,
    days: value.days === 7 || value.days === 30 || value.days === 90 ? value.days : undefined,
    page:
      Number.isInteger(Number(value.page)) && Number(value.page) > 0
        ? Number(value.page)
        : undefined,
  };
}

export const Route = createFileRoute("/_authenticated/monitoring/ai-usage")({
  validateSearch: validateMonitoringAiUsageSearch,
  component: () => {
    const search = Route.useSearch();
    const navigate = Route.useNavigate();
    return (
      <MonitoringAiUsagePage
        onSearchChange={(next) => void navigate({ search: next, replace: true })}
        search={search}
      />
    );
  },
});
