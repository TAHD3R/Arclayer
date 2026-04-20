import { useTranslation } from "react-i18next";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@arclayer/ui/select";
import { Switch } from "@arclayer/ui/switch";
import { setThemePreferenceWithTransition } from "@/components/ui/theme-transition";
import { PreferenceSettingRow } from "@/pages/usercenter/appearance/components/preference-setting-row";
import { usePreferencesStore } from "@/stores/use-preference-store";
import type { ThemePreference } from "@/types/stores";

type PreferenceSwitchRowProps = {
  checked: boolean;
  description: string;
  onCheckedChange: (checked: boolean) => void;
  title: string;
};

function PreferenceSwitchRow(props: PreferenceSwitchRowProps) {
  return (
    <PreferenceSettingRow
      title={props.title}
      description={props.description}
      action={<Switch checked={props.checked} onCheckedChange={props.onCheckedChange} />}
    />
  );
}

export function UserAppearanceSection() {
  const { t } = useTranslation("account");

  const themePreference = usePreferencesStore((s) => s.themePreference);
  const notificationPanelPinned = usePreferencesStore((s) => s.notificationPanelPinned);
  const setNotificationPanelPinned = usePreferencesStore((s) => s.setNotificationPanelPinned);
  const showNotificationsBadge = usePreferencesStore((s) => s.showNotificationsBadge);
  const setShowNotificationsBadge = usePreferencesStore((s) => s.setShowNotificationsBadge);
  const reduceMotion = usePreferencesStore((s) => s.reduceMotion);
  const setReduceMotion = usePreferencesStore((s) => s.setReduceMotion);
  const contrastMore = usePreferencesStore((s) => s.contrastMore);
  const setContrastMore = usePreferencesStore((s) => s.setContrastMore);
  const themeOptions: Array<{ label: string; value: ThemePreference }> = [
    { value: "system", label: t("ACCOUNT_THEME_SYSTEM") },
    { value: "light", label: t("ACCOUNT_THEME_LIGHT") },
    { value: "dark", label: t("ACCOUNT_THEME_DARK") },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PreferenceSettingRow
        title={t("ACCOUNT_SETTINGS_THEME_LABEL")}
        description={t("ME_PREF_APPEARANCE_PANEL_DESC")}
        action={
          <Select
            value={themePreference}
            onValueChange={(value) => {
              void setThemePreferenceWithTransition(value as ThemePreference, {
                direction: "ltr",
              });
            }}
          >
            <SelectTrigger className="w-56" size="default">
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper" align="end">
              {themeOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />

      <PreferenceSwitchRow
        checked={contrastMore}
        description={t("ME_PREF_CONTRAST_DESC")}
        onCheckedChange={setContrastMore}
        title={t("ME_PREF_CONTRAST_TITLE")}
      />

      <PreferenceSwitchRow
        checked={notificationPanelPinned}
        description={t("ME_PREF_NOTIFICATIONS_PANEL_PIN_DESC")}
        onCheckedChange={setNotificationPanelPinned}
        title={t("ME_PREF_NOTIFICATIONS_PANEL_PIN_TITLE")}
      />

      <PreferenceSwitchRow
        checked={showNotificationsBadge}
        description={t("ME_PREF_NAV_BADGE_DESC")}
        onCheckedChange={setShowNotificationsBadge}
        title={t("ME_PREF_NAV_BADGE_TITLE")}
      />

      <PreferenceSwitchRow
        checked={reduceMotion}
        description={t("ME_PREF_MOTION_REDUCE_DESC")}
        onCheckedChange={setReduceMotion}
        title={t("ME_PREF_MOTION_REDUCE_TITLE")}
      />
    </div>
  );
}

export function UserSidebarNavigationSection() {
  const { t } = useTranslation("account");
  const showFavoritesInSidebar = usePreferencesStore((s) => s.sidebarItemVisibility.favorites);
  const setSidebarItemVisible = usePreferencesStore((s) => s.setSidebarItemVisible);

  return (
    <PreferenceSwitchRow
      checked={showFavoritesInSidebar}
      description={t("ME_PREF_SIDEBAR_FAVORITES_DESC")}
      onCheckedChange={(checked) => setSidebarItemVisible("favorites", checked)}
      title={t("ME_PREF_SIDEBAR_FAVORITES_TITLE")}
    />
  );
}
