import { useTranslation } from "react-i18next";

import { UserCenterSettingPanel } from "@/pages/usercenter/shared/usercenter-setting-panel";
import { UserCenterSettingsSectionStack } from "@/pages/usercenter/shared/usercenter-settings-section-stack";
import { UserAppearanceSection } from "@/pages/usercenter/appearance/components/preferences-appearance-section";
import { UserLocalizationSection } from "@/pages/usercenter/appearance/components/preferences-localization-section";

type UserAppearanceViewMode = "page" | "dialog";

type UserAppearanceViewProps = {
  mode?: UserAppearanceViewMode;
};

export function UserAppearanceView(props: UserAppearanceViewProps) {
  const mode = props.mode ?? "page";
  const panelVariant = mode === "dialog" ? "dialog" : "page";
  const { t } = useTranslation("account");

  return (
    <UserCenterSettingsSectionStack mode={mode}>
      <UserCenterSettingPanel
        title={t("ME_PREF_APPEARANCE_PANEL_TITLE")}
        variant={panelVariant}
        showDivider
      >
        <UserAppearanceSection />
      </UserCenterSettingPanel>

      <UserCenterSettingPanel
        title={t("ME_PREF_LOCALIZATION_PANEL_TITLE")}
        description={t("ME_PREF_LOCALIZATION_PANEL_DESC")}
        variant={panelVariant}
        showDivider
      >
        <UserLocalizationSection />
      </UserCenterSettingPanel>
    </UserCenterSettingsSectionStack>
  );
}
