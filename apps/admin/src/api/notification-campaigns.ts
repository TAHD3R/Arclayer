import { api } from "@/lib/http";
import { toQueryString } from "@/lib/api";

import type { PageData } from "@arclayer/openapi/admin-types";

export type NotificationCampaignState =
  | "draft"
  | "scheduled"
  | "dispatching"
  | "completed"
  | "partially_failed"
  | "cancelled"
  | "archived";

export type NotificationCampaignChannel = "in_app" | "email";
export type NotificationPresentation = "inbox" | "toast" | "modal" | "banner" | "email";
export type NotificationSeverity = "info" | "success" | "warning" | "error";
export type NotificationCampaignConflictPolicy = "queue" | "replace_lower_priority";
export type NotificationCampaignOrdering =
  | "-updated_at"
  | "updated_at"
  | "-created_at"
  | "created_at"
  | "-schedule_at"
  | "schedule_at"
  | "-priority"
  | "priority";
export type NotificationAudienceKind = "all_active_users" | "explicit_users" | "workspace_members";
export type NotificationActionKind = "internal_route" | "external_https";
export type NotificationDismissPolicy = "dismissible" | "action_required";
export type NotificationMediaKind = "image" | "video";
export type NotificationDeliveryState =
  | "pending"
  | "processing"
  | "sent"
  | "delivered"
  | "failed"
  | "suppressed"
  | "cancelled";

export type NotificationAudienceRule = {
  kind: NotificationAudienceKind;
  userIds?: readonly string[];
  workspaceIds?: readonly string[];
  createdFrom?: string | null;
  createdTo?: string | null;
  lastActiveFrom?: string | null;
  lastActiveTo?: string | null;
};

export type NotificationAction = {
  kind: NotificationActionKind;
  label: string;
  target: string;
};

export type NotificationMedia = {
  assetId: string;
  kind: NotificationMediaKind;
  altText: string;
  posterAssetId?: string | null;
  captionsAssetId?: string | null;
};

export type NotificationInboxPayload = {
  title: string;
  body?: string | null;
  severity: NotificationSeverity;
  action?: NotificationAction | null;
};

export type NotificationEmailPayload = {
  templateKey: string;
  templateVersion: number;
  variables: Readonly<Record<string, unknown>>;
};

export type NotificationModalPayload = {
  title: string;
  body: string;
  media?: NotificationMedia | null;
  primaryAction: NotificationAction;
  secondaryAction?: NotificationAction | null;
  dismissPolicy: NotificationDismissPolicy;
};

export type NotificationBannerPayload = {
  title: string;
  body?: string | null;
  action?: NotificationAction | null;
  dismissible: boolean;
};

export type NotificationToastPayload = {
  title: string;
  body?: string | null;
  action?: NotificationAction | null;
};

export type NotificationCampaignVariantInput = {
  locale: string;
  inbox?: NotificationInboxPayload | null;
  email?: NotificationEmailPayload | null;
  modal?: NotificationModalPayload | null;
  banner?: NotificationBannerPayload | null;
  toast?: NotificationToastPayload | null;
};

export type NotificationCampaignEditableFields = {
  name: string;
  internalDescription?: string | null;
  audience: NotificationAudienceRule;
  timezone: string;
  displayStartAt?: string | null;
  displayEndAt?: string | null;
  priority: number;
  conflictPolicy: NotificationCampaignConflictPolicy;
  channels: readonly NotificationCampaignChannel[];
  presentations: readonly NotificationPresentation[];
  fallbackLocale?: string | null;
  variants: readonly NotificationCampaignVariantInput[];
};

export type NotificationCampaignOwner = {
  id: string;
  username: string;
  displayName?: string | null;
  avatarUrl?: string | null;
};

export type NotificationCampaignMetrics = {
  recipients: number;
  pending: number;
  sent: number;
  delivered: number;
  failed: number;
  suppressed: number;
  read: number;
  clicked: number;
  dismissed: number;
};

export type NotificationCampaignSummary = {
  id: string;
  name: string;
  internalDescription?: string | null;
  owner: NotificationCampaignOwner;
  revision: number;
  state: NotificationCampaignState;
  audience: NotificationAudienceRule;
  audienceEstimate?: number | null;
  scheduleAt?: string | null;
  timezone: string;
  displayStartAt?: string | null;
  displayEndAt?: string | null;
  priority: number;
  conflictPolicy: NotificationCampaignConflictPolicy;
  channels: NotificationCampaignChannel[];
  presentations: NotificationPresentation[];
  fallbackLocale?: string | null;
  operationJobId?: string | null;
  metrics: NotificationCampaignMetrics;
  publishedAt?: string | null;
  completedAt?: string | null;
  cancelledAt?: string | null;
  archivedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type NotificationCampaignVariant = NotificationCampaignVariantInput & {
  id: string;
  campaignId: string;
  revision: number;
  isFallback: boolean;
  createdAt: string;
  updatedAt: string;
};

export type NotificationCampaignDetail = NotificationCampaignSummary & {
  variants: NotificationCampaignVariant[];
};

export type NotificationAudienceEstimate = {
  campaignId: string;
  revision: number;
  estimatedRecipients: number;
  breakdown: Record<string, number>;
  sampledUserIds: string[];
};

export type NotificationCampaignPreview = {
  campaignId: string;
  revision: number;
  variants: Array<{
    locale: string;
    usedFallback: boolean;
    presentations: Partial<Record<NotificationPresentation, Record<string, unknown>>>;
  }>;
  warnings: string[];
};

export type NotificationCampaignPublishResult = {
  campaign: NotificationCampaignSummary;
  jobId: string;
  scheduledAt: string;
};

export type NotificationCampaignCancellationResult = {
  campaign: NotificationCampaignSummary;
  cancelledDeliveries: number;
  nonRecallableDeliveries: number;
};

export type NotificationDelivery = {
  id: string;
  campaignId: string;
  variantId: string;
  recipientUserId: string;
  recipientLocale: string;
  channel: NotificationCampaignChannel;
  presentation: NotificationPresentation;
  state: NotificationDeliveryState;
  attemptCount: number;
  scheduledAt?: string | null;
  sentAt?: string | null;
  deliveredAt?: string | null;
  readAt?: string | null;
  clickedAt?: string | null;
  dismissedAt?: string | null;
  providerMessageId?: string | null;
  failureCode?: string | null;
  failureMessage?: string | null;
  isRetryable: boolean;
  createdAt: string;
  updatedAt: string;
};

export async function listNotificationCampaigns(params: {
  page?: number;
  size?: number;
  q?: string;
  ordering?: NotificationCampaignOrdering;
  states?: readonly NotificationCampaignState[];
}): Promise<PageData<NotificationCampaignSummary>> {
  const query = toQueryString({
    page: params.page ?? 1,
    size: params.size ?? 20,
    q: params.q,
    ordering: params.ordering,
    state: params.states,
  });
  return api.get<PageData<NotificationCampaignSummary>>(`/system/notifications/campaigns${query}`);
}

export async function getNotificationCampaign(
  campaignId: string,
): Promise<NotificationCampaignDetail> {
  return api.get<NotificationCampaignDetail>(`/system/notifications/campaigns/${campaignId}`);
}

export async function createNotificationCampaign(
  payload: NotificationCampaignEditableFields,
): Promise<NotificationCampaignDetail> {
  return api.post<NotificationCampaignDetail>("/system/notifications/campaigns", payload);
}

export async function updateNotificationCampaign(
  campaignId: string,
  payload: Partial<NotificationCampaignEditableFields> & { expectedRevision: number },
): Promise<NotificationCampaignDetail> {
  return api.patch<NotificationCampaignDetail>(
    `/system/notifications/campaigns/${campaignId}`,
    payload,
  );
}

export async function estimateNotificationCampaignAudience(
  campaignId: string,
): Promise<NotificationAudienceEstimate> {
  return api.post<NotificationAudienceEstimate>(
    `/system/notifications/campaigns/${campaignId}/audience-estimate`,
  );
}

export async function previewNotificationCampaign(
  campaignId: string,
): Promise<NotificationCampaignPreview> {
  return api.post<NotificationCampaignPreview>(
    `/system/notifications/campaigns/${campaignId}/preview`,
  );
}

export async function publishNotificationCampaign(
  campaignId: string,
  payload: { expectedRevision: number; scheduleAt?: string | null },
): Promise<NotificationCampaignPublishResult> {
  return api.post<NotificationCampaignPublishResult>(
    `/system/notifications/campaigns/${campaignId}/publish`,
    payload,
  );
}

export async function cancelNotificationCampaign(
  campaignId: string,
  expectedRevision: number,
): Promise<NotificationCampaignCancellationResult> {
  return api.post<NotificationCampaignCancellationResult>(
    `/system/notifications/campaigns/${campaignId}/cancel`,
    { expectedRevision },
  );
}

export async function listNotificationCampaignDeliveries(
  campaignId: string,
  params: {
    page?: number;
    size?: number;
    states?: readonly NotificationDeliveryState[];
  },
): Promise<PageData<NotificationDelivery>> {
  const query = toQueryString({
    page: params.page ?? 1,
    size: params.size ?? 20,
    state: params.states,
  });
  return api.get<PageData<NotificationDelivery>>(
    `/system/notifications/campaigns/${campaignId}/deliveries${query}`,
  );
}

export async function retryNotificationCampaignFailures(
  campaignId: string,
  idempotencyKey: string,
): Promise<{ campaignId: string; jobId: string; retryableDeliveryCount: number }> {
  return api.post<{ campaignId: string; jobId: string; retryableDeliveryCount: number }>(
    `/system/notifications/campaigns/${campaignId}/retry-failures`,
    undefined,
    { headers: { "Idempotency-Key": idempotencyKey } },
  );
}

export async function archiveNotificationCampaign(
  campaignId: string,
  expectedRevision: number,
): Promise<NotificationCampaignSummary> {
  return api.post<NotificationCampaignSummary>(
    `/system/notifications/campaigns/${campaignId}/archive`,
    { expectedRevision },
  );
}
