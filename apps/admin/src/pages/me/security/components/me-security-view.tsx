import { useTranslation } from "react-i18next";

import { MeSettingPanel } from "@/pages/me/components/me-setting-panel";
import { MeSettingsCategoryLayout } from "@/pages/me/components/me-settings-category-layout";
import { MeSecurityChangePasswordSection } from "@/pages/me/security/components/security-change-password-section";
import { MeSecuritySessionsSection } from "@/pages/me/security/components/security-sessions-section";
import { SettingVerticalItem } from "@celestial/ui/setting-vertical-item";
import { Button } from "antd";

export function MeSecurityView() {
  const { t } = useTranslation(["account", "settings"]);

  return (
    <MeSettingsCategoryLayout
      categories={[
        {
          key: "password",
          label: t("account:ME_SECURITY_PANEL_TITLE"),
          content: (
            <MeSettingPanel title={t("account:ME_SECURITY_PANEL_TITLE")} showDivider>
              <div className="flex flex-col gap-8">
                <MeSecurityChangePasswordSection />
              </div>
            </MeSettingPanel>
          ),
        },
        {
          key: "2fa",
          label: t("account:ME_SECURITY_2FA_PANEL_TITLE"),
          content: (
            <MeSettingPanel title={t("account:ME_SECURITY_2FA_PANEL_TITLE")} showDivider>
              <div className="flex flex-col gap-8">
                <SettingVerticalItem
                  title={t("account:ME_SECURITY_2FA_TITLE")}
                  description={t("account:ME_SECURITY_2FA_DISABLED_DESC")}
                  control={
                    <Button disabled type="primary" autoInsertSpace={false}>
                      {t("account:ME_SECURITY_2FA_ENABLE")}
                    </Button>
                  }
                />
              </div>
            </MeSettingPanel>
          ),
        },
        {
          key: "sessions",
          label: t("account:ME_SECURITY_SESSIONS_PANEL_TITLE"),
          content: (
            <MeSettingPanel title={t("account:ME_SECURITY_SESSIONS_PANEL_TITLE")} showDivider>
              <div className="flex flex-col gap-8">
                <MeSecuritySessionsSection />
              </div>
            </MeSettingPanel>
          ),
        },
        {
          key: "signin",
          label: t("account:ME_SECURITY_SIGNIN_PANEL_TITLE"),
          content: (
            <MeSettingPanel title={t("account:ME_SECURITY_SIGNIN_PANEL_TITLE")} showDivider={false}>
              <div className="flex flex-col gap-8">
                <SettingVerticalItem
                  title={t("account:ME_SECURITY_SIGNIN_PANEL_TITLE")}
                  description={t("account:ME_SECURITY_SIGNIN_DISABLED_DESC")}
                  control={
                    <Button disabled type="default" autoInsertSpace={false}>
                      {t("settings:SETTINGS_NOT_SET")}
                    </Button>
                  }
                />
              </div>
            </MeSettingPanel>
          ),
        },
      ]}
    />
  );
}
