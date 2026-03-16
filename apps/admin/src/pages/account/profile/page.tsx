import { useTranslation } from "react-i18next";

import { DefaultPage } from "@/components/common/default-page";
import { MeProfileView } from "@/pages/me/profile/components/me-profile-view";

export function AccountProfilePage() {
  const { t } = useTranslation("account");

  return (
    <DefaultPage
      title={t("ME_TAB_PROFILE")}
      description={t("ME_TAB_PROFILE_DESC")}
      showFavoriteToggle={false}
    >
      <MeProfileView mode="page" includeDanger={false} />
    </DefaultPage>
  );
}
