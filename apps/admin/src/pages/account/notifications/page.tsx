import { useTranslation } from "react-i18next";

import { DefaultPage } from "@/components/common/default-page";
import { MeNotificationSettingsPage } from "@/pages/me/notifications/page";

export function AccountNotificationsPage() {
  const { t } = useTranslation("account");

  return (
    <DefaultPage
      title={t("ME_TAB_NOTIFICATIONS")}
      description={t("ME_TAB_NOTIFICATIONS_DESC")}
      showFavoriteToggle={false}
    >
      <MeNotificationSettingsPage mode="page" />
    </DefaultPage>
  );
}
