import { useTranslation } from "react-i18next";

import { DefaultPage } from "@/layouts/page-shell/default-page";
import { UserSecurityView } from "@/pages/usercenter/security/components/user-security-view";

export function UserCenterSecurityPage() {
  const { t } = useTranslation("account");

  return (
    <DefaultPage
      title={t("ME_TAB_SECURITY")}
      description={t("ME_TAB_SECURITY_DESC")}
      showFavoriteToggle={false}
    >
      <UserSecurityView mode="page" />
    </DefaultPage>
  );
}
