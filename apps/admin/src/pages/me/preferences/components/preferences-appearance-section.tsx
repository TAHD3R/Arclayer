import { Alert, Button, Slider, Switch } from "antd";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { SettingVerticalItem } from "@/components/settings-primitives/setting-vertical-item";
import { usePreferencesStore } from "@/stores/use-preference-store";
import { ThemeCard } from "@/pages/me/preferences/components/preferences-theme-cards";
import { setThemePreferenceWithTransition } from "@/components/ui/theme-transition";
import { cn } from "@celestial/lib/utils";

export function MePreferencesAppearanceSection() {
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

  const fontScalePreference = usePreferencesStore((s) => s.fontScalePreference);
  const setFontScalePreference = usePreferencesStore((s) => s.setFontScalePreference);

  const fontWeightPreference = usePreferencesStore((s) => s.fontWeightPreference);
  const setFontWeightPreference = usePreferencesStore((s) => s.setFontWeightPreference);

  const fontScale = fontScalePreference ?? 1;
  const fontWeight = fontWeightPreference ?? 400;

  const showFontScaleAlert = useMemo(() => fontScale <= 0.9 || fontScale >= 1.2, [fontScale]);
  const showFontWeightAlert = useMemo(() => fontWeight <= 320 || fontWeight >= 650, [fontWeight]);

  const sliderLargeClassName = "w-64 md:w-80";

  return (
    <div className="flex flex-col gap-8">
      <SettingVerticalItem
        title={t("ACCOUNT_SETTINGS_THEME_LABEL")}
        description={t("ME_PREF_APPEARANCE_PANEL_DESC")}
        control={
          <div className="grid gap-3 md:grid-cols-3">
            <ThemeCard
              value="system"
              selected={themePreference === "system"}
              label={t("ACCOUNT_THEME_SYSTEM")}
              onSelect={() => {
                void setThemePreferenceWithTransition("system", { direction: "ltr" });
              }}
            />
            <ThemeCard
              value="light"
              selected={themePreference === "light"}
              label={t("ACCOUNT_THEME_LIGHT")}
              onSelect={() => {
                void setThemePreferenceWithTransition("light", { direction: "ltr" });
              }}
            />
            <ThemeCard
              value="dark"
              selected={themePreference === "dark"}
              label={t("ACCOUNT_THEME_DARK")}
              onSelect={() => {
                void setThemePreferenceWithTransition("dark", { direction: "ltr" });
              }}
            />
          </div>
        }
      />

      <SettingVerticalItem
        title={t("ME_PREF_TEXT_SIZE_TITLE")}
        description={t("ME_PREF_TEXT_SIZE_DESC")}
        control={
          <div className="max-w-xl">
            {showFontScaleAlert ? (
              <Alert
                type="warning"
                showIcon
                message={t("ME_PREF_TEXT_SIZE_ALERT_TITLE")}
                description={t("ME_PREF_TEXT_SIZE_ALERT_DESC")}
                className="mb-3"
              />
            ) : null}

            <div className="flex justify-end">
              <Button
                type="link"
                className="px-0!"
                disabled={fontScalePreference === null}
                onClick={() => setFontScalePreference(null)}
              >
                {t("ME_PREF_RESET_TO_DEFAULT")}
              </Button>
            </div>

            <div className="flex items-center gap-3">
              <div className="shrink-0 select-none text-label-secondary leading-none text-[24px]">
                Aa
              </div>
              <Slider
                className={cn("me-typography-slider", sliderLargeClassName)}
                min={0.85}
                max={1.25}
                step={0.05}
                value={fontScale}
                tooltip={{ formatter: (v) => `${Math.round(Number(v) * 100)}%` }}
                onChange={(v) => setFontScalePreference(typeof v === "number" ? v : Number(v))}
              />
              <div className="shrink-0 select-none text-label-secondary leading-none text-[36px]">
                Aa
              </div>
            </div>
          </div>
        }
      />

      <SettingVerticalItem
        title={t("ME_PREF_TEXT_WEIGHT_TITLE")}
        description={t("ME_PREF_TEXT_WEIGHT_DESC")}
        control={
          <div className="max-w-xl">
            {showFontWeightAlert ? (
              <Alert
                type="warning"
                showIcon
                message={t("ME_PREF_TEXT_WEIGHT_ALERT_TITLE")}
                description={t("ME_PREF_TEXT_WEIGHT_ALERT_DESC")}
                className="mb-3"
              />
            ) : null}

            <div className="flex justify-end">
              <Button
                type="link"
                className="px-0!"
                disabled={fontWeightPreference === null}
                onClick={() => setFontWeightPreference(null)}
              >
                {t("ME_PREF_RESET_TO_DEFAULT")}
              </Button>
            </div>

            <div className="flex items-center gap-3">
              <div className="shrink-0 select-none text-label-secondary leading-none font-light text-[24px]">
                Aa
              </div>
              <Slider
                className={cn("me-typography-slider", sliderLargeClassName)}
                min={300}
                max={700}
                step={25}
                value={fontWeight}
                tooltip={{ formatter: (v) => String(v) }}
                onChange={(v) => setFontWeightPreference(typeof v === "number" ? v : Number(v))}
              />
              <div className="shrink-0 select-none text-label-secondary leading-none font-bold text-[36px]">
                Aa
              </div>
            </div>
          </div>
        }
      />

      <SettingVerticalItem
        title={t("ME_PREF_CONTRAST_TITLE")}
        description={t("ME_PREF_CONTRAST_DESC")}
        control={
          <Switch
            checked={contrastMore}
            onChange={(checked) => setContrastMore(Boolean(checked))}
          />
        }
      />

      <SettingVerticalItem
        title={t("ME_PREF_NOTIFICATIONS_PANEL_PIN_TITLE")}
        description={t("ME_PREF_NOTIFICATIONS_PANEL_PIN_DESC")}
        control={
          <Switch
            checked={notificationPanelPinned}
            onChange={(checked) => setNotificationPanelPinned(Boolean(checked))}
          />
        }
      />

      <SettingVerticalItem
        title={t("ME_PREF_NAV_BADGE_TITLE")}
        description={t("ME_PREF_NAV_BADGE_DESC")}
        control={
          <Switch
            checked={showNotificationsBadge}
            onChange={(checked) => setShowNotificationsBadge(Boolean(checked))}
          />
        }
      />

      <SettingVerticalItem
        title={t("ME_PREF_MOTION_REDUCE_TITLE")}
        description={t("ME_PREF_MOTION_REDUCE_DESC")}
        control={
          <Switch
            checked={reduceMotion}
            onChange={(checked) => setReduceMotion(Boolean(checked))}
          />
        }
      />
    </div>
  );
}
