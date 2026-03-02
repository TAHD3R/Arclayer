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
