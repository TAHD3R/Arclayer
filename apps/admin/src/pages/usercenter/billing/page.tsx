import { CreditCard, FileText, Receipt } from "lucide-react";
import { useTranslation } from "react-i18next";

import { DefaultPage } from "@/layouts/page-shell/default-page";
import { UserCenterStateCard } from "@/pages/usercenter/shared/account-settings-state-card";

export function UserCenterBillingContent() {
  const { t } = useTranslation("account");

  return (
    <div className="grid gap-4 xl:grid-cols-3">
      <UserCenterStateCard
        eyebrow={t("ACCOUNT_PAGE_BILLING_TITLE")}
        title={t("ACCOUNT_BILLING_SCOPE_TITLE")}
        description={t("ACCOUNT_BILLING_SCOPE_DESC")}
        icon={<CreditCard />}
      />
      <UserCenterStateCard
        eyebrow={t("ACCOUNT_SECTION_ACCOUNT")}
        title={t("ACCOUNT_BILLING_SURFACE_TITLE")}
        description={t("ACCOUNT_BILLING_SURFACE_DESC")}
        icon={<Receipt />}
      />
      <UserCenterStateCard
        eyebrow={t("ACCOUNT_SETTINGS_TITLE")}
        title={t("ACCOUNT_BILLING_STATUS_TITLE")}
        description={t("ACCOUNT_BILLING_STATUS_DESC")}
        icon={<FileText />}
        tone="warning"
      />
    </div>
  );
}

export function UserCenterBillingPage() {
  const { t } = useTranslation("account");

  return (
    <DefaultPage
      title={t("ACCOUNT_PAGE_BILLING_TITLE")}
      description={t("ACCOUNT_PAGE_BILLING_DESC")}
      showFavoriteToggle={false}
    >
      <UserCenterBillingContent />
    </DefaultPage>
  );
}
