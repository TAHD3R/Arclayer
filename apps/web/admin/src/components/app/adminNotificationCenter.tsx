import {
  NotificationList,
  type NotificationListItem,
} from "@/components/animate-ui/components/community/notification-list";

export type AdminNotificationCenterProps = {
  maxItems?: number;
  unreadCount: number;
  items: NotificationListItem[];
  className?: string;
  onViewAll?: () => void;
  onItemClick?: (item: NotificationListItem) => void;
  onDismiss?: (id: NotificationListItem["id"]) => void;
};

export function AdminNotificationCenter({
  maxItems = 3,
  items,
  unreadCount,
  className,
  onViewAll,
  onItemClick,
  onDismiss,
}: AdminNotificationCenterProps) {
  if (!unreadCount || unreadCount <= 0) return null;

  return (
    <NotificationList
      items={items}
      maxItems={maxItems}
      className={className}
      onViewAll={onViewAll}
      totalCount={unreadCount}
      onItemClick={onItemClick}
      onDismiss={onDismiss}
    />
  );
}
