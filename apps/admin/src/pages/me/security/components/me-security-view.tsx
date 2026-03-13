import { useTranslation } from "react-i18next";
import { Button } from "antd";
import { KeyRound, Mail } from "lucide-react";

import { MeSettingPanel } from "@/pages/me/components/me-setting-panel";
import { MeSettingsCategoryLayout } from "@/pages/me/components/me-settings-category-layout";
import { MeSecuritySessionsSection } from "@/pages/me/security/components/security-sessions-section";
import { MeSecurityTwoFactorSection } from "@/pages/me/security/components/security-two-factor-section";
import { SettingCard, SettingCardContent, SettingCardHeader } from "@celestial/ui/setting-card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@celestial/ui/tooltip";

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
        {
          key: "signin",
          label: t("account:ME_SECURITY_SIGNIN_PANEL_TITLE"),
          content: (
            <MeSettingPanel
              title={t("account:ME_SECURITY_SIGNIN_PANEL_TITLE")}
              showDivider
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
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="inline-flex">
                            <Button disabled size="small" type="primary" autoInsertSpace={false}>
                              {t("account:ME_SECURITY_SIGNIN_CONFIGURE")}
                            </Button>
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>{t("account:ME_FEATURE_NOT_AVAILABLE")}</TooltipContent>
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
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="inline-flex">
                            <Button disabled size="small" type="primary" autoInsertSpace={false}>
                              {t("account:ME_SECURITY_SIGNIN_CONFIGURE")}
                            </Button>
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>{t("account:ME_FEATURE_NOT_AVAILABLE")}</TooltipContent>
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
