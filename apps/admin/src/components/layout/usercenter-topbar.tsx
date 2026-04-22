import { useTranslation } from "react-i18next";

import { AdminTopbar } from "@/components/layout/admin-topbar";

export function UserCenterTopbar(props: {
  backLabel?: string;
  onBack?: () => void;
  notificationOpen: boolean;
  showNotificationsBadge: boolean;
  unreadCount: number;
  onNotificationToggle: () => void;
  className?: string;
}) {
  const { t } = useTranslation(["notifications", "common"]);

  return (
    <AdminTopbar
      notificationOpen={props.notificationOpen}
      showNotificationsBadge={props.showNotificationsBadge}
      unreadCount={props.unreadCount}
      onNotificationToggle={props.onNotificationToggle}
      leadingMode="back"
      backLabel={props.backLabel ?? t("common:BACK")}
      onBack={props.onBack ?? (() => undefined)}
      className={props.className}
    />
  );
}
