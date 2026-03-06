import { useTranslation } from "react-i18next";
import { Button, Tooltip } from "antd";
import { BaseTag } from "@/components/ui/tags";
import { Smartphone, KeyRound, Mail } from "lucide-react";

import { MeSettingPanel } from "@/pages/me/components/me-setting-panel";
import { MeSettingsCategoryLayout } from "@/pages/me/components/me-settings-category-layout";
import { MeSecurityChangePasswordSection } from "@/pages/me/security/components/security-change-password-section";
import { MeSecuritySessionsSection } from "@/pages/me/security/components/security-sessions-section";
import { SettingCard, SettingCardContent, SettingCardHeader } from "@celestial/ui/setting-card";

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
          key: "password",
          label: t("account:ME_SECURITY_PANEL_TITLE"),
          content: (
            <MeSettingPanel
              title={t("account:ME_SECURITY_PANEL_TITLE")}
              showDivider
              variant={panelVariant}
            >
              <div className="flex flex-col gap-6">
                <MeSecurityChangePasswordSection />
              </div>
            </MeSettingPanel>
          ),
        },
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
                <SettingCard>
                  <SettingCardHeader
                    title={t("account:ME_SECURITY_2FA_TITLE")}
                    description={t("account:ME_SECURITY_2FA_DISABLED_DESC")}
                    action={
                      <Tooltip title={t("account:ME_FEATURE_NOT_AVAILABLE")}>
                        <Button disabled type="primary" autoInsertSpace={false}>
                          {t("account:ME_SECURITY_2FA_ENABLE")}
                        </Button>
                      </Tooltip>
                    }
                  />
                  <SettingCardContent>
                    <div className="flex items-start gap-4">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted/30 border border-border/60 shadow-sm">
                        <Smartphone className="h-5 w-5 text-label-secondary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-body font-medium text-label-primary">
                            {t("account:ME_SECURITY_2FA_AUTH_APP_TITLE")}
                          </span>
                          <BaseTag>{t("account:ME_SECURITY_2FA_AUTH_APP_NOT_CONFIGURED")}</BaseTag>
                        </div>
                        <div className="mt-1 text-callout text-label-secondary">
                          {t("account:ME_SECURITY_2FA_AUTH_APP_DESC")}
                        </div>
                      </div>
                    </div>
                  </SettingCardContent>
                </SettingCard>
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
        {
          key: "signin",
          label: t("account:ME_SECURITY_SIGNIN_PANEL_TITLE"),
          content: (
            <MeSettingPanel
              title={t("account:ME_SECURITY_SIGNIN_PANEL_TITLE")}
              showDivider={false}
              variant={panelVariant}
            >
              <div className="flex flex-col gap-6">
                <SettingCard>
                  <SettingCardHeader
                    title={t("account:ME_SECURITY_SIGNIN_PANEL_TITLE")}
                    description={t("account:ME_SECURITY_SIGNIN_DISABLED_DESC")}
                  />
                  <SettingCardContent>
                    <div className="flex items-center justify-between pb-4 border-b border-border/40">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted/30 border border-border/60 shadow-sm">
                          <Mail className="h-4 w-4 text-label-secondary" />
                        </div>
                        <span className="text-body font-medium text-label-primary">
                          {t("account:ME_SECURITY_SIGNIN_METHOD_EMAIL_LINK")}
                        </span>
                      </div>
                      <Tooltip title={t("account:ME_FEATURE_NOT_AVAILABLE")}>
                        <Button disabled size="small" type="default" autoInsertSpace={false}>
                          {t("account:ME_SECURITY_SIGNIN_CONFIGURE")}
                        </Button>
                      </Tooltip>
                    </div>
                    <div className="flex items-center justify-between pt-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted/30 border border-border/60 shadow-sm">
                          <KeyRound className="h-4 w-4 text-label-secondary" />
                        </div>
                        <span className="text-body font-medium text-label-primary">
                          {t("account:ME_SECURITY_SIGNIN_METHOD_PASSKEYS")}
                        </span>
                      </div>
                      <Tooltip title={t("account:ME_FEATURE_NOT_AVAILABLE")}>
                        <Button disabled size="small" type="default" autoInsertSpace={false}>
                          {t("account:ME_SECURITY_SIGNIN_CONFIGURE")}
                        </Button>
                      </Tooltip>
                    </div>
                  </SettingCardContent>
                </SettingCard>
              </div>
            </MeSettingPanel>
          ),
        },
      ]}
    />
  );
}
