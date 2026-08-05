import { useTranslation } from "react-i18next";

import { AdminLogo } from "@/components/layout/admin-logo";

export function HomeBrandHero() {
  const { t } = useTranslation(["auth", "ai"]);

  return (
    <header className="flex flex-col items-center gap-3 text-center select-none">
      <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2">
        <span className="select-none [&_img]:pointer-events-none [&_img]:select-none">
          <AdminLogo ariaLabel={t("auth:SLOGAN_TITLE")} size={48} />
        </span>
        <h1 className="flex flex-wrap items-baseline justify-center gap-x-2 text-largetitle font-semibold tracking-tight text-label-primary text-balance">
          <span>{t("auth:SLOGAN_TITLE")}</span>
          <span>{t("ai:AI_CHAT_HOME_PRODUCT_PROMISE")}</span>
        </h1>
      </div>
      <p className="text-title3 font-medium text-label-secondary">
        {t("ai:AI_CHAT_HOME_PRODUCT_SUBTITLE")}
      </p>
    </header>
  );
}
