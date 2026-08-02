import { api } from "@/lib/http";
import { toQueryString, workspacePath } from "@/lib/api";

import type {
  DomainWorkspacesListWorkspaceActivityData,
  PageDataAuditEventOut,
} from "@arclayer/openapi";

type ListActivityParams = NonNullable<DomainWorkspacesListWorkspaceActivityData["query"]>;
type ActivityPage = Omit<PageDataAuditEventOut, "items"> & {
  items: NonNullable<PageDataAuditEventOut["items"]>;
};

function requireActivityPage(page: PageDataAuditEventOut): ActivityPage {
  if (!Array.isArray(page.items)) {
    throw new Error("Invalid activity pagination response");
  }
  return { ...page, items: page.items };
}

export async function listWorkspaceActivity(
  workspaceId: string,
  params: ListActivityParams = {},
): Promise<ActivityPage> {
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
  const page = await api.get<PageDataAuditEventOut>(
    workspacePath(workspaceId, `/activity${query}`),
  );
  return requireActivityPage(page);
}
