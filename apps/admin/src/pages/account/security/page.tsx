import { useTranslation } from "react-i18next";

import { DefaultPage } from "@/components/common/default-page";
import { MeSecurityView } from "@/pages/me/security/components/me-security-view";

export function AccountSecurityPage() {
  const { t } = useTranslation("account");

  return (
    <DefaultPage
      title={t("ME_TAB_SECURITY")}
      description={t("ME_TAB_SECURITY_DESC")}
      showFavoriteToggle={false}
    >
      <MeSecurityView mode="page" />
    </DefaultPage>
  );
}
