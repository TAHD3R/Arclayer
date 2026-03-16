import { useTranslation } from "react-i18next";

import { ChromeTabsList, ChromeTabsTrigger } from "@celestial/ui/chrome-tabs";

export function WorkspaceSettingsTabs() {
  const { t } = useTranslation(["settings"]);

  return (
    <ChromeTabsList>
      <ChromeTabsTrigger value="basics">
        {t("settings:SETTINGS_WORKSPACE_TAB_BASICS")}
      </ChromeTabsTrigger>
      <ChromeTabsTrigger value="danger">
        {t("settings:SETTINGS_WORKSPACE_TAB_DANGER")}
      </ChromeTabsTrigger>
    </ChromeTabsList>
  );
}
