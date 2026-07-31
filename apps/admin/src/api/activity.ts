import { api } from "@/lib/http";
import { toQueryString, workspacePath } from "@/lib/api";

import type { ActivityEvent, ListActivityParams, PageData } from "@arclayer/openapi/admin-types";

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
