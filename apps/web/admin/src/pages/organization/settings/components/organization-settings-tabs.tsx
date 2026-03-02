import { useTranslation } from "react-i18next";

import { ChromeTabsList, ChromeTabsTrigger } from "@/components/ui/chrome-tabs";

export function OrganizationSettingsTabs() {
  const { t } = useTranslation(["settings"]);

  return (
    <ChromeTabsList>
      <ChromeTabsTrigger value="basics">
        {t("settings:SETTINGS_WORKSPACE_TAB_BASICS")}
      </ChromeTabsTrigger>
      <ChromeTabsTrigger value="danger">{t("settings:SETTINGS_ORG_TAB_DANGER")}</ChromeTabsTrigger>
    </ChromeTabsList>
  );
}
