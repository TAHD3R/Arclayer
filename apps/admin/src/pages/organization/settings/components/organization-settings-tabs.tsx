import { useTranslation } from "react-i18next";

import { ChromeTabsList, ChromeTabsTrigger } from "@celestial/ui/chrome-tabs";

export function OrganizationSettingsTabs(props: { showBasics?: boolean }) {
  const { t } = useTranslation(["settings"]);
  const showBasics = props.showBasics ?? true;

  return (
    <ChromeTabsList>
      {showBasics ? (
        <ChromeTabsTrigger value="basics">
          {t("settings:SETTINGS_WORKSPACE_TAB_BASICS")}
        </ChromeTabsTrigger>
      ) : null}
      <ChromeTabsTrigger value="danger">{t("settings:SETTINGS_ORG_TAB_DANGER")}</ChromeTabsTrigger>
    </ChromeTabsList>
  );
}
