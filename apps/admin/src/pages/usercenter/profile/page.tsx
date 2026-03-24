import { useTranslation } from "react-i18next";

import { DefaultPage } from "@/layouts/page-shell/default-page";
import { UserProfileView } from "@/pages/usercenter/profile/components/user-profile-view";

export function UserCenterProfilePage() {
  const { t } = useTranslation("account");

  return (
    <DefaultPage
      title={t("ME_TAB_PROFILE")}
      description={t("ME_TAB_PROFILE_DESC")}
      showFavoriteToggle={false}
    >
      <UserProfileView mode="page" includeDanger={false} />
    </DefaultPage>
  );
}
