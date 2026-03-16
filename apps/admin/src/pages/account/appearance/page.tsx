import { useTranslation } from "react-i18next";

import { DefaultPage } from "@/components/common/default-page";
import { MePreferencesView } from "@/pages/me/preferences/components/me-preferences-view";

export function AccountAppearancePage() {
  const { t } = useTranslation("account");

  return (
    <DefaultPage
      title={t("ME_TAB_PREFERENCES")}
      description={t("ME_TAB_PREFERENCES_DESC")}
      showFavoriteToggle={false}
    >
      <MePreferencesView mode="page" />
    </DefaultPage>
  );
}
