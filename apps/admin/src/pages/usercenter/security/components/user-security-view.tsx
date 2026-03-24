import { useTranslation } from "react-i18next";

import { UserCenterSettingPanel } from "@/pages/usercenter/shared/usercenter-setting-panel";
import { UserCenterSettingsSectionStack } from "@/pages/usercenter/shared/usercenter-settings-section-stack";
import { UserSessionsSection } from "@/pages/usercenter/security/components/security-sessions-section";
import { UserTwoFactorSection } from "@/pages/usercenter/security/components/security-two-factor-section";

type UserSecurityViewMode = "page" | "dialog";

type UserSecurityViewProps = {
  mode?: UserSecurityViewMode;
};

export function UserSecurityView(props: UserSecurityViewProps) {
  const mode = props.mode ?? "page";
  const panelVariant = mode === "dialog" ? "dialog" : "page";
  const { t } = useTranslation(["account", "settings", "common"]);

  return (
    <UserCenterSettingsSectionStack mode={mode}>
      <UserCenterSettingPanel
        title={t("account:ME_SECURITY_2FA_PANEL_TITLE")}
        showDivider
        variant={panelVariant}
      >
        <div className="flex flex-col gap-6">
          <UserTwoFactorSection />
        </div>
      </UserCenterSettingPanel>

      <UserCenterSettingPanel
        title={t("account:ME_SECURITY_SESSIONS_PANEL_TITLE")}
        showDivider
        variant={panelVariant}
      >
        <div className="flex flex-col gap-6">
          <UserSessionsSection />
        </div>
      </UserCenterSettingPanel>
    </UserCenterSettingsSectionStack>
  );
}
