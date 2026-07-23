import { createFileRoute } from "@tanstack/react-router";

import { SystemAuditLogPage, type AuditLogView } from "@/pages/system/audit-log/page";
import type { ObservabilityPeriodDays } from "@/pages/system/observability/components/period-select";

const VIEWS: ReadonlySet<AuditLogView> = new Set(["records", "analysis", "events"]);
const PERIODS: readonly ObservabilityPeriodDays[] = new Set([7, 14, 30, 90]);

type AuditLogSearch = {
  view?: AuditLogView;
  days?: ObservabilityPeriodDays;
  actorUserId?: string;
};

function SystemAuditLogRoute() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const days = search.days ?? 30;
  const activeView = search.view ?? "records";
  const updateSearch = (next: AuditLogSearch) =>
    void navigate({
      search: (current) => ({ ...current, ...next }),
      replace: true,
    });

  return (
    <SystemAuditLogPage
      days={days}
      activeView={activeView}
      initialActorUserId={search.actorUserId}
      onDaysChange={(nextDays) => updateSearch({ days: nextDays === 30 ? undefined : nextDays })}
      onViewChange={(view) => updateSearch({ view: view === "records" ? undefined : view })}
    />
  );
}

export const Route = createFileRoute("/system/audit-log/")({
  staticData: { titleKey: "platform:AUDIT_TITLE" },
  validateSearch: (search: Record<string, unknown>): AuditLogSearch => {
    const view = typeof search.view === "string" ? search.view : undefined;
    const days = Number(search.days);
    const actorUserId = typeof search.actorUserId === "string" ? search.actorUserId.trim() : "";
    return {
      ...(VIEWS.has(view as AuditLogView) ? { view: view as AuditLogView } : {}),
      ...(PERIODS.has(days as ObservabilityPeriodDays)
        ? { days: days as ObservabilityPeriodDays }
        : {}),
      ...(actorUserId ? { actorUserId } : {}),
    };
  },
  component: SystemAuditLogRoute,
});
