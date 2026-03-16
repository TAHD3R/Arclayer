import { CreditCard, FileText, Receipt } from "@arclayer/ui/icons/lucide-animated";
import { useTranslation } from "react-i18next";

import { DefaultPage } from "@/components/common/default-page";
import { AccountSettingsStateCard } from "@/pages/account/shared/account-settings-state-card";

export function AccountBillingPage() {
  const { t } = useTranslation("account");

  return (
    <DefaultPage
      title={t("ACCOUNT_PAGE_BILLING_TITLE")}
      description={t("ACCOUNT_PAGE_BILLING_DESC")}
      showFavoriteToggle={false}
    >
      <div className="grid gap-4 xl:grid-cols-3">
        <AccountSettingsStateCard
          eyebrow={t("ACCOUNT_PAGE_BILLING_TITLE")}
          title={t("ACCOUNT_BILLING_SCOPE_TITLE")}
          description={t("ACCOUNT_BILLING_SCOPE_DESC")}
          icon={<CreditCard />}
        />
        <AccountSettingsStateCard
          eyebrow={t("ACCOUNT_SECTION_ACCOUNT")}
          title={t("ACCOUNT_BILLING_SURFACE_TITLE")}
          description={t("ACCOUNT_BILLING_SURFACE_DESC")}
          icon={<Receipt />}
        />
        <AccountSettingsStateCard
          eyebrow={t("ACCOUNT_SETTINGS_TITLE")}
          title={t("ACCOUNT_BILLING_STATUS_TITLE")}
          description={t("ACCOUNT_BILLING_STATUS_DESC")}
          icon={<FileText />}
          tone="warning"
        />
      </div>
    </DefaultPage>
  );
}
