import { useTranslation } from "react-i18next";

import { DefaultPage } from "@/components/common/default-page";

export function OrganizationUsagePage() {
  const { t } = useTranslation(["nav", "common"]);

  return (
    <DefaultPage
      title={t("nav:NAV_ORG_USAGE")}
      description={t("common:PAGE_COMING_SOON_DESC")}
      width="fixed"
    >
      <div className="rounded-lg border border-border bg-card p-6">
        <div className="text-title3 font-semibold">{t("common:PAGE_COMING_SOON")}</div>
        <p className="mt-2 text-footnote text-label-secondary">
          {t("common:PAGE_COMING_SOON_DESC")}
        </p>
      </div>
    </DefaultPage>
  );
}
