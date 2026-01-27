import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import {
  NotificationList,
  type NotificationListItem,
} from "@/components/animate-ui/components/community/notification-list";

export type AdminNotificationCenterProps = {
  maxItems?: number;
  items?: NotificationListItem[];
  className?: string;
  onViewAll?: () => void;
};

export function AdminNotificationCenter({
  maxItems = 3,
  items,
  className,
  onViewAll,
}: AdminNotificationCenterProps) {
  const { t } = useTranslation("common");

  const fallbackItems = useMemo<NotificationListItem[]>(
    () => [
      {
        id: "demo-1",
        title: t("NOTIFICATIONS_DEMO_1_TITLE"),
        subtitle: t("NOTIFICATIONS_DEMO_1_SUBTITLE"),
        time: t("NOTIFICATIONS_DEMO_1_TIME"),
        count: 2,
      },
      {
        id: "demo-2",
        title: t("NOTIFICATIONS_DEMO_2_TITLE"),
        subtitle: t("NOTIFICATIONS_DEMO_2_SUBTITLE"),
        time: t("NOTIFICATIONS_DEMO_2_TIME"),
      },
      {
        id: "demo-3",
        title: t("NOTIFICATIONS_DEMO_3_TITLE"),
        subtitle: t("NOTIFICATIONS_DEMO_3_SUBTITLE"),
        time: t("NOTIFICATIONS_DEMO_3_TIME"),
      },
    ],
    [t],
  );

  // NOTE: `items` 未传入时使用占位数据；传入空数组则隐藏（由 NotificationList 内部返回 null）。
  return (
    <NotificationList
      items={items ?? fallbackItems}
      maxItems={maxItems}
      className={className}
      onViewAll={onViewAll}
    />
  );
}
