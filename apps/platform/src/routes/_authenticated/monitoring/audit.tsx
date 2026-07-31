import { createFileRoute } from "@tanstack/react-router";

import { MonitoringAuditPage } from "@/pages/monitoring-audit";

export type MonitoringAuditSearch = Readonly<{
  occurredFrom?: string;
  occurredTo?: string;
  eventName?: string;
  workspaceId?: string;
  projectId?: string;
  actorUserId?: string;
  subjectUserId?: string;
  entityType?: string;
  entityId?: string;
  ordering?: "-occurred_at" | "occurred_at";
  page?: number;
}>;

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function datetime(value: unknown): string | undefined {
  const candidate = text(value);
  return candidate && !Number.isNaN(Date.parse(candidate)) ? candidate : undefined;
}

function publicId(value: unknown): string | undefined {
  const candidate = text(value);
  return candidate && /^[A-Za-z0-9_-]{22}$/.test(candidate) ? candidate : undefined;
}

function page(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

export const Route = createFileRoute("/_authenticated/monitoring/audit")({
  validateSearch: (value: Record<string, unknown>): MonitoringAuditSearch => ({
    occurredFrom: datetime(value.occurredFrom),
    occurredTo: datetime(value.occurredTo),
    eventName: text(value.eventName),
    workspaceId: publicId(value.workspaceId),
    projectId: publicId(value.projectId),
    actorUserId: publicId(value.actorUserId),
    subjectUserId: publicId(value.subjectUserId),
    entityType: text(value.entityType),
    entityId: publicId(value.entityId),
    ordering:
      value.ordering === "-occurred_at" || value.ordering === "occurred_at"
        ? value.ordering
        : undefined,
    page: page(value.page),
  }),
  component: () => {
    const search = Route.useSearch();
    const navigate = Route.useNavigate();
    return (
      <MonitoringAuditPage
        onSearchChange={(next) => void navigate({ search: next, replace: true })}
        search={search}
      />
    );
  },
});
