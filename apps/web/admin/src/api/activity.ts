import { api } from "@/lib/http";
import { workspacePath } from "@/api/workspace-path";

export type PageData<T> = {
  items: T[];
  total: number;
  page: number;
  size: number;
  pages: number;
  next?: number | null;
  prev?: number | null;
};

export type ActivityEvent = {
  id: string;
  createdAt: string;
  updatedAt: string;

  occurredAt: string;
  eventName: string;

  organizationId: string | null;
  workspaceId: string | null;

  actorUserId: string | null;
  subjectUserId: string | null;

  actor: {
    id: string;
    username: string | null;
    displayName: string | null;
    avatarUrl: string | null;
  } | null;

  subject: {
    id: string;
    username: string | null;
    displayName: string | null;
    avatarUrl: string | null;
  } | null;

  entityType: string | null;
  entityId: string | null;

  traceId: string | null;
  source: string | null;

  properties: Record<string, unknown> | null;
};

export type ListActivityParams = {
  page?: number;
  size?: number;
  occurredFrom?: string;
  occurredTo?: string;
  eventName?: string;
  workspaceId?: string;
  actorUserId?: string;
  subjectUserId?: string;
  entityType?: string;
  entityId?: string;
};

function toQueryString(params: Record<string, unknown>): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined) continue;
    if (v === null) continue;
    if (Array.isArray(v)) {
      for (const item of v) {
        if (item === undefined || item === null) continue;
        qs.append(k, String(item));
      }
      continue;
    }
    qs.set(k, String(v));
  }
  const s = qs.toString();
  return s ? `?${s}` : "";
}

export async function listSystemActivity(
  params: ListActivityParams = {},
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
