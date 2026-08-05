import { useTranslation } from "react-i18next";

import { useSettingsScreen } from "@/components/layout/settings-screen-provider";
import { useWorkspaceCommerceManagementAccess } from "@/hooks/use-workspace-commerce-management-access";
import { PreferenceSettingRow } from "@/pages/usercenter/appearance/components/preference-setting-row";
import { UserCenterSettingPanel } from "@/pages/usercenter/shared/usercenter-setting-panel";
import { Button } from "@arclayer/ui/button";

export function WorkspaceSettingsBasicsCommercePanel(props: { workspaceId: string }) {
  const { t } = useTranslation(["account", "commerce"]);
  const settingsScreen = useSettingsScreen();
  const access = useWorkspaceCommerceManagementAccess(props.workspaceId);

  if (access.managementAccessStatus !== "manage") return null;

  return (
    <UserCenterSettingPanel
      title={t("account:SETTINGS_WORKSPACE_PLAN_USAGE_TITLE")}
      variant="dialog"
      showDivider
    >
      <PreferenceSettingRow
        title={t("commerce:MEMBER_LIMIT_DEFAULT_TITLE")}
        description={t("commerce:MEMBER_LIMIT_DEFAULT_DESCRIPTION")}
        action={
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              settingsScreen.openSettings({
                screen: "workspace.plan-usage",
                section: "default-member-credit-limit",
              })
            }
          >
            {t("account:SETTINGS_NAV_WORKSPACE_PLAN_USAGE")}
          </Button>
        }
      />
    </UserCenterSettingPanel>
  );
}
