import { useTranslation } from "react-i18next";

import { DefaultPage } from "@/layouts/page-shell/default-page";
import { UserNotificationSettingsView } from "@/pages/usercenter/notifications/components/user-notification-settings-view";

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
