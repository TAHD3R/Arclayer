import { api } from "@/lib/http";
import { toQueryString, workspacePath } from "@/lib/api";

import type { ActivityEvent, ListActivityParams, PageData } from "@arclayer/openapi/admin-types";

export type ActivityOrdering = "-occurred_at" | "occurred_at";
export type SystemActivityListParams = ListActivityParams & { ordering?: ActivityOrdering };

export async function listSystemActivity(
  params: SystemActivityListParams = {},
): Promise<PageData<ActivityEvent>> {
  const query = toQueryString({
    page: params.page ?? 1,
    size: params.size ?? 20,
    occurredFrom: params.occurredFrom,
    occurredTo: params.occurredTo,
    eventName: params.eventName,
    workspaceId: params.workspaceId,
    actorUserId: params.actorUserId,
    subjectUserId: params.subjectUserId,
    entityType: params.entityType,
    entityId: params.entityId,
    projectId: params.projectId,
    ordering: params.ordering,
  });
  return api.get<PageData<ActivityEvent>>(`/system/activity${query}`);
}

export async function getSystemActivityEvent(eventId: string): Promise<ActivityEvent> {
  return api.get<ActivityEvent>(`/system/activity/${eventId}`);
}

export async function listWorkspaceActivity(
  workspaceId: string,
  params: ListActivityParams = {},
): Promise<PageData<ActivityEvent>> {
  const query = toQueryString({
    page: params.page ?? 1,
    size: params.size ?? 20,
    occurredFrom: params.occurredFrom,
    occurredTo: params.occurredTo,
    eventName: params.eventName,
    actorUserId: params.actorUserId,
    subjectUserId: params.subjectUserId,
    entityType: params.entityType,
    entityId: params.entityId,
  });
  return api.get<PageData<ActivityEvent>>(workspacePath(workspaceId, `/activity${query}`));
}
