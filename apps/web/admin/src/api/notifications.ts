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

export type NotificationCategory = "team" | "security" | "task" | string;

export type NotificationItem = {
  id: string;
  workspaceId: string;
  recipientUserId: string;
  actorUserId?: string | null;

  category: NotificationCategory;
  title: string;
  body?: string | null;

  targetTo: string;
  targetMeta?: Record<string, unknown> | null;

  eventName?: string | null;
  dedupeKey?: string | null;

  readAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type NotificationPreview = {
  unreadCount: number;
  items: NotificationItem[];
};

export type ListNotificationsParams = {
  status?: "unread" | "all";
  category?: NotificationCategory;
  page?: number;
  size?: number;
};

function toQueryString(params: Record<string, unknown>): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    qs.set(key, String(value));
  }
  const s = qs.toString();
  return s ? `?${s}` : "";
}

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
