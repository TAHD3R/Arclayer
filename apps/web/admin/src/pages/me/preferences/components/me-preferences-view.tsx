import { useTranslation } from "react-i18next";

import { MeSettingPanel } from "@/pages/me/components/me-setting-panel";
import { MeSettingsCategoryLayout } from "@/pages/me/components/me-settings-category-layout";
import { MePreferencesAppearanceSection } from "@/pages/me/preferences/components/preferences-appearance-section";
import { MePreferencesLocalizationSection } from "@/pages/me/preferences/components/preferences-localization-section";

export function MePreferencesView() {
  const { t } = useTranslation("account");

  return (
    <MeSettingsCategoryLayout
      categories={[
        {
          key: "appearance",
          label: t("ME_PREF_APPEARANCE_PANEL_TITLE"),
          content: (
            <MeSettingPanel title={t("ME_PREF_APPEARANCE_PANEL_TITLE")} showDivider>
              <MePreferencesAppearanceSection />
            </MeSettingPanel>
          ),
        },
        {
          key: "localization",
          label: t("ME_PREF_LOCALIZATION_PANEL_TITLE"),
          content: (
            <MeSettingPanel
              title={t("ME_PREF_LOCALIZATION_PANEL_TITLE")}
              description={t("ME_PREF_LOCALIZATION_PANEL_DESC")}
              showDivider={false}
            >
              <MePreferencesLocalizationSection />
            </MeSettingPanel>
          ),
        },
      ]}
    />
  );
}
