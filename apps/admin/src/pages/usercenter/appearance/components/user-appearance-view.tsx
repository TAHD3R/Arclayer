import { useTranslation } from "react-i18next";

import { SettingsSectionAnchor } from "@/components/layout/settings-screen-provider";
import { UserCenterSettingPanel } from "@/pages/usercenter/shared/usercenter-setting-panel";
import { UserCenterSettingsSectionStack } from "@/pages/usercenter/shared/usercenter-settings-section-stack";
import {
  UserAppearanceSection,
  UserSidebarNavigationSection,
} from "@/pages/usercenter/appearance/components/preferences-appearance-section";
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
        <SettingsSectionAnchor section="appearance">
          <UserAppearanceSection />
        </SettingsSectionAnchor>
      </UserCenterSettingPanel>

      <UserCenterSettingPanel
        title={t("ME_PREF_LOCALIZATION_PANEL_TITLE")}
        variant={panelVariant}
        showDivider
      >
        <SettingsSectionAnchor section="language">
          <UserLocalizationSection />
        </SettingsSectionAnchor>
      </UserCenterSettingPanel>

      <UserCenterSettingPanel
        title={t("ME_PREF_SIDEBAR_NAVIGATION_TITLE")}
        variant={panelVariant}
        showDivider
      >
        <SettingsSectionAnchor section="datetime">
          <UserSidebarNavigationSection />
        </SettingsSectionAnchor>
      </UserCenterSettingPanel>
    </UserCenterSettingsSectionStack>
  );
}
