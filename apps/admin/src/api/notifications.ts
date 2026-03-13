import { api } from "@/lib/http";
import { toQueryString, workspacePath } from "@/lib/api";

import type {
  ListNotificationsParams,
  NotificationItem,
  NotificationPreferenceChannel,
  NotificationPreferences,
  NotificationPreview,
  PageData,
} from "@/types/api";

export async function getUnreadNotificationPreview(params?: {
  limit?: number;
}): Promise<NotificationPreview> {
  const qs = toQueryString({ limit: params?.limit ?? 3 });
  return api.get<NotificationPreview>(`/me/notifications/unread/preview${qs}`);
}

export async function listNotifications(
  params: ListNotificationsParams,
): Promise<PageData<NotificationItem>> {
  const qs = toQueryString({
    status: params.status ?? "unread",
    category: params.category,
    page: params.page ?? 1,
    size: params.size ?? 20,
  });
  return api.get<PageData<NotificationItem>>(`/me/notifications${qs}`);
}

export async function markNotificationRead(
  notificationId: string,
): Promise<{ id: string; readAt?: string | null }> {
  return api.post<{ id: string; readAt?: string | null }>(
    `/me/notifications/${notificationId}/read`,
  );
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
  return api.get<NotificationPreferences>("/me/notifications/preferences");
}

export async function patchMyNotificationPreference(payload: {
  topicKey: string;
  channel: NotificationPreferenceChannel;
  enabled: boolean;
}): Promise<NotificationPreferences> {
  return api.patch<NotificationPreferences>("/me/notifications/preferences", {
    topic_key: payload.topicKey,
    channel: payload.channel,
    enabled: payload.enabled,
  });
}
