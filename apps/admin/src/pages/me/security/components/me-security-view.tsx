import { useTranslation } from "react-i18next";

import { MeSettingPanel } from "@/pages/me/components/me-setting-panel";
import { MeSettingsCategoryLayout } from "@/pages/me/components/me-settings-category-layout";
import { MeSecuritySessionsSection } from "@/pages/me/security/components/security-sessions-section";
import { MeSecurityTwoFactorSection } from "@/pages/me/security/components/security-two-factor-section";

type MeSecurityViewMode = "page" | "dialog";

type MeSecurityViewProps = {
  mode?: MeSecurityViewMode;
};

export function MeSecurityView(props: MeSecurityViewProps) {
  const mode = props.mode ?? "page";
  const panelVariant = mode === "dialog" ? "dialog" : "page";
  const { t } = useTranslation(["account", "settings", "common"]);

  return (
    <MeSettingsCategoryLayout
      showNav={mode === "page"}
      categories={[
        {
          key: "2fa",
          label: t("account:ME_SECURITY_2FA_PANEL_TITLE"),
          content: (
            <MeSettingPanel
              title={t("account:ME_SECURITY_2FA_PANEL_TITLE")}
              showDivider
              variant={panelVariant}
            >
              <div className="flex flex-col gap-6">
                <MeSecurityTwoFactorSection />
              </div>
            </MeSettingPanel>
          ),
        },
        {
          key: "sessions",
          label: t("account:ME_SECURITY_SESSIONS_PANEL_TITLE"),
          content: (
            <MeSettingPanel
              title={t("account:ME_SECURITY_SESSIONS_PANEL_TITLE")}
              showDivider
              variant={panelVariant}
            >
              <div className="flex flex-col gap-6">
                <MeSecuritySessionsSection />
              </div>
            </MeSettingPanel>
          ),
        },
      ]}
    />
  );
}
