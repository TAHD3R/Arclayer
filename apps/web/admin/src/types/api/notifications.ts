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
  archivedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type NotificationPreview = {
  unreadCount: number;
  items: NotificationItem[];
};

export type ListNotificationsParams = {
  status?: "unread" | "all" | "archived";
  category?: NotificationCategory;
  page?: number;
  size?: number;
};
