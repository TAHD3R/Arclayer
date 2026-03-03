import { useTranslation } from "react-i18next";

import { ChromeTabsList, ChromeTabsTrigger } from "@celestial/ui/chrome-tabs";

export function WorkspaceSettingsTabs() {
  const { t } = useTranslation(["settings"]);

  return (
    <ChromeTabsList>
      <ChromeTabsTrigger value="basics">
        {t("settings:SETTINGS_WORKSPACE_TAB_BASICS")}
      </ChromeTabsTrigger>
      <ChromeTabsTrigger value="collaboration">
        {t("settings:SETTINGS_WORKSPACE_TAB_COLLABORATION")}
      </ChromeTabsTrigger>
      <ChromeTabsTrigger value="content_strategy">
        {t("settings:SETTINGS_WORKSPACE_TAB_CONTENT_STRATEGY")}
      </ChromeTabsTrigger>
      <ChromeTabsTrigger value="integrations">
        {t("settings:SETTINGS_WORKSPACE_TAB_INTEGRATIONS")}
      </ChromeTabsTrigger>
      <ChromeTabsTrigger value="resource_processing">
        {t("settings:SETTINGS_WORKSPACE_TAB_RESOURCE_PROCESSING")}
      </ChromeTabsTrigger>
      <ChromeTabsTrigger value="danger">
        {t("settings:SETTINGS_WORKSPACE_TAB_DANGER")}
      </ChromeTabsTrigger>
    </ChromeTabsList>
  );
}
