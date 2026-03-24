import { useTranslation } from "react-i18next";

import { DefaultPage } from "@/layouts/page-shell/default-page";
import { UserAppearanceView } from "@/pages/usercenter/appearance/components/user-appearance-view";

export function UserCenterAppearancePage() {
  const { t } = useTranslation("account");

  return (
    <DefaultPage
      title={t("ME_TAB_PREFERENCES")}
      description={t("ME_TAB_PREFERENCES_DESC")}
      showFavoriteToggle={false}
    >
      <UserAppearanceView mode="page" />
    </DefaultPage>
  );
}
