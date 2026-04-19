import { UserCenterSettingPanel } from "@/pages/usercenter/shared/usercenter-setting-panel";

import type { WorkspaceSettingsBasicsController } from "../hooks/use-workspace-settings-basics-controller";
import { WorkspaceSettingsIconAccordionItem } from "./workspace-settings-icon-accordion-item";
import { WorkspaceSettingsBasicsLocalizationPanel } from "./workspace-settings-basics-localization-panel";

export function WorkspaceSettingsBasicsCorePanels(props: {
  controller: WorkspaceSettingsBasicsController;
}) {
  const c = props.controller;
  const { t } = c;

  return (
    <>
      <UserCenterSettingPanel
        title={t("settings:SETTINGS_WORKSPACE_BASICS_PANEL_TITLE")}
        variant="dialog"
        showDivider
      >
        <div className="flex flex-col gap-4">
          <WorkspaceSettingsIconAccordionItem controller={c} />
        </div>
      </UserCenterSettingPanel>

      <WorkspaceSettingsBasicsLocalizationPanel controller={c} />
    </>
  );
}
