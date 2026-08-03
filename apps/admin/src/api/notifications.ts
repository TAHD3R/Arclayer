import { api } from "@/lib/http";
import { toQueryString, workspacePath } from "@/lib/api";

import type {
  DomainWorkspacesListMyNotificationsData,
  NotificationPreferencePatchIn,
  NotificationPreferencesOut,
  NotificationSoundPreferencePatchIn,
  NotificationPreferenceTopicOut,
  NotificationPreviewOut as NotificationPreview,
  PageDataNotificationOut,
} from "@arclayer/openapi";

type ListNotificationsParams = NonNullable<DomainWorkspacesListMyNotificationsData["query"]>;
type NotificationPreferenceChannel = NotificationPreferencePatchIn["channel"];
export type NotificationPreferences = Omit<NotificationPreferencesOut, "topics"> & {
  topics: NotificationPreferenceTopicOut[];
};
export const NOTIFICATION_PREFERENCES_QUERY_KEY = ["me", "notification-preferences"] as const;
type NotificationPage = Omit<PageDataNotificationOut, "items"> & {
  items: NonNullable<PageDataNotificationOut["items"]>;
};

function requireNotificationPreferences(
  preferences: NotificationPreferencesOut,
): NotificationPreferences {
  if (!Array.isArray(preferences.topics)) {
    throw new Error("Invalid notification preferences response");
  }
  return { ...preferences, topics: preferences.topics };
}

function requireNotificationPage(page: PageDataNotificationOut): NotificationPage {
  if (!Array.isArray(page.items)) {
    throw new Error("Invalid notification pagination response");
  }
  return { ...page, items: page.items };
}

export async function getUnreadNotificationPreview(params?: {
  limit?: number;
}): Promise<NotificationPreview> {
  const qs = toQueryString({ limit: params?.limit ?? 3 });
  return api.get<NotificationPreview>(`/me/notifications/unread/preview${qs}`);
}

export async function listNotifications(
  params: ListNotificationsParams,
): Promise<NotificationPage> {
  const qs = toQueryString({
    status: params.status ?? "unread",
    category: params.category,
    page: params.page ?? 1,
    size: params.size ?? 20,
  });
  const page = await api.get<PageDataNotificationOut>(`/me/notifications${qs}`);
  return requireNotificationPage(page);
}

export async function markNotificationRead(
  notificationId: string,
): Promise<{ id: string; readAt?: string | null }> {
  return api.post<{ id: string; readAt?: string | null }>(
    `/me/notifications/${notificationId}/read`,
  );
}

export async function recordNotificationInteraction(
  notificationId: string,
  interaction: "read" | "click" | "dismiss",
): Promise<{
  notificationId: string;
  deliveryId: string;
  kind: "read" | "click" | "dismiss";
  occurredAt: string;
}> {
  return api.post<{
    notificationId: string;
    deliveryId: string;
    kind: "read" | "click" | "dismiss";
    occurredAt: string;
  }>(`/me/notifications/${notificationId}/interactions/${interaction}`);
}

export async function markAllNotificationsRead(): Promise<{
  totalCount: number;
  successCount: number;
}> {
  return api.post<{ totalCount: number; successCount: number }>("/me/notifications/read-all");
}

export async function seedDemoNotifications(
  workspaceId: string,
  params?: { count?: number },
): Promise<{ createdCount: number }> {
  return api.post<{ createdCount: number }>(workspacePath(workspaceId, "/notifications/dev/seed"), {
    count: params?.count ?? 8,
  });
}

export async function deleteNotification(notificationId: string): Promise<{ id: string }> {
  return api.delete<{ id: string }>(`/me/notifications/${notificationId}`);
}

export async function archiveNotification(
  notificationId: string,
): Promise<{ id: string; archivedAt?: string | null }> {
  return api.post<{ id: string; archivedAt?: string | null }>(
    `/me/notifications/${notificationId}/archive`,
  );
}

export async function getMyNotificationPreferences(): Promise<NotificationPreferences> {
  const preferences = await api.get<NotificationPreferencesOut>("/me/notifications/preferences");
  return requireNotificationPreferences(preferences);
}

export async function patchMyNotificationPreference(payload: {
  topicKey: string;
  channel: NotificationPreferenceChannel;
  enabled: boolean;
}): Promise<NotificationPreferences> {
  const body: NotificationPreferencePatchIn = {
    topicKey: payload.topicKey,
    channel: payload.channel,
    enabled: payload.enabled,
  };
  const preferences = await api.patch<NotificationPreferencesOut>(
    "/me/notifications/preferences",
    body,
  );
  return requireNotificationPreferences(preferences);
}

export async function patchMyNotificationSound(
  payload: NotificationSoundPreferencePatchIn,
): Promise<NotificationPreferences> {
  const preferences = await api.patch<NotificationPreferencesOut>(
    "/me/notifications/preferences/sound",
    payload,
  );
  return requireNotificationPreferences(preferences);
}
