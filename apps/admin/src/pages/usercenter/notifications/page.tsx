import { useTranslation } from "react-i18next";

import { DefaultPage } from "@/components/common/default-page";
import { UserNotificationSettingsView } from "@/pages/usercenter/notifications/user-notification-settings-view";

export function UserCenterNotificationsPage() {
  const { t } = useTranslation("account");

  return (
    <DefaultPage
      title={t("ME_TAB_NOTIFICATIONS")}
      description={t("ME_TAB_NOTIFICATIONS_DESC")}
      showFavoriteToggle={false}
    >
      <UserNotificationSettingsView mode="page" />
    </DefaultPage>
  );
}
