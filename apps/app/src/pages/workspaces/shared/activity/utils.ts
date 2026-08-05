import type { ActivityFilters } from "@/pages/workspaces/shared/activity/components/activity-filter-popover";

export const ACTIVITY_PAGE_SIZE = 20;

export function stableStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function normalizeActivityFilters(
  filters: ActivityFilters,
  options: { includeWorkspaceId?: boolean } = {},
): ActivityFilters {
  const trimOrUndefined = (value: string | undefined) => {
    const normalized = String(value || "").trim();
    return normalized ? normalized : undefined;
  };

  return {
    occurredFrom: trimOrUndefined(filters.occurredFrom),
    occurredTo: trimOrUndefined(filters.occurredTo),
    eventName: trimOrUndefined(filters.eventName),
    workspaceId: options.includeWorkspaceId ? trimOrUndefined(filters.workspaceId) : undefined,
    actorUserId: trimOrUndefined(filters.actorUserId),
    subjectUserId: trimOrUndefined(filters.subjectUserId),
  };
}

export function createDefaultActivityFilters(): ActivityFilters {
  return {};
}
