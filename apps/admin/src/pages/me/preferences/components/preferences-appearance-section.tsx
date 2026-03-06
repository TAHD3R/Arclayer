import { Alert, Button, Slider, Switch } from "antd";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { RotateCcw } from "lucide-react";

import { SettingCard, SettingCardContent, SettingCardHeader } from "@celestial/ui/setting-card";
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
    <div className="flex flex-col gap-6">
      <SettingCard>
        <SettingCardHeader
          title={t("ACCOUNT_SETTINGS_THEME_LABEL")}
          description={t("ME_PREF_APPEARANCE_PANEL_DESC")}
        />
        <SettingCardContent>
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
        </SettingCardContent>
      </SettingCard>

      <SettingCard>
        <SettingCardHeader
          title={t("ME_PREF_TEXT_SIZE_TITLE")}
          description={t("ME_PREF_TEXT_SIZE_DESC")}
          action={
            <Button
              type="primary"
              icon={<RotateCcw className="h-3.5 w-3.5" />}
              disabled={fontScalePreference === null}
              onClick={() => setFontScalePreference(null)}
              autoInsertSpace={false}
              className={fontScalePreference === null ? "hidden" : ""}
            >
              {t("ME_PREF_RESET_TO_DEFAULT")}
            </Button>
          }
        />
        <SettingCardContent>
          <div className="max-w-xl">
            {showFontScaleAlert ? (
              <Alert
                type="warning"
                showIcon
                message={t("ME_PREF_TEXT_SIZE_ALERT_TITLE")}
                description={t("ME_PREF_TEXT_SIZE_ALERT_DESC")}
                className="mb-6"
              />
            ) : null}

            <div className="flex items-center gap-3">
              <div className="shrink-0 select-none text-title2 leading-none text-label-secondary">
                Aa
              </div>
              <Slider
                className={cn("me-typography-slider", sliderLargeClassName)}
                min={0.85}
                max={1.25}
                step={0.05}
                value={fontScale}
                tooltip={{
                  formatter: (v) => `${Math.round(Number(v) * 100)}%`,
                  getPopupContainer: () => document.body,
                }}
                onChange={(v) => setFontScalePreference(typeof v === "number" ? v : Number(v))}
              />
              <div className="shrink-0 select-none text-largetitle leading-none text-label-secondary">
                Aa
              </div>
            </div>
          </div>
        </SettingCardContent>
      </SettingCard>

      <SettingCard>
        <SettingCardHeader
          title={t("ME_PREF_TEXT_WEIGHT_TITLE")}
          description={t("ME_PREF_TEXT_WEIGHT_DESC")}
          action={
            <Button
              type="primary"
              icon={<RotateCcw className="h-3.5 w-3.5" />}
              disabled={fontWeightPreference === null}
              onClick={() => setFontWeightPreference(null)}
              autoInsertSpace={false}
              className={fontWeightPreference === null ? "hidden" : ""}
            >
              {t("ME_PREF_RESET_TO_DEFAULT")}
            </Button>
          }
        />
        <SettingCardContent>
          <div className="max-w-xl">
            {showFontWeightAlert ? (
              <Alert
                type="warning"
                showIcon
                message={t("ME_PREF_TEXT_WEIGHT_ALERT_TITLE")}
                description={t("ME_PREF_TEXT_WEIGHT_ALERT_DESC")}
                className="mb-6"
              />
            ) : null}

            <div className="flex items-center gap-3">
              <div className="shrink-0 select-none text-title2 font-light leading-none text-label-secondary">
                Aa
              </div>
              <Slider
                className={cn("me-typography-slider", sliderLargeClassName)}
                min={300}
                max={700}
                step={25}
                value={fontWeight}
                tooltip={{
                  formatter: (v) => String(v),
                  getPopupContainer: () => document.body,
                }}
                onChange={(v) => setFontWeightPreference(typeof v === "number" ? v : Number(v))}
              />
              <div className="shrink-0 select-none text-largetitle font-bold leading-none text-label-secondary">
                Aa
              </div>
            </div>
          </div>
        </SettingCardContent>
      </SettingCard>

      <SettingCard>
        <div className="flex items-center justify-between px-6 py-5 sm:px-6">
          <div>
            <div className="text-callout font-semibold text-label-primary">
              {t("ME_PREF_CONTRAST_TITLE")}
            </div>
            <div className="mt-1 text-callout text-label-secondary">
              {t("ME_PREF_CONTRAST_DESC")}
            </div>
          </div>
          <Switch
            checked={contrastMore}
            onChange={(checked) => setContrastMore(Boolean(checked))}
          />
        </div>
      </SettingCard>

      <SettingCard>
        <div className="flex items-center justify-between px-6 py-5 sm:px-6">
          <div>
            <div className="text-callout font-semibold text-label-primary">
              {t("ME_PREF_NOTIFICATIONS_PANEL_PIN_TITLE")}
            </div>
            <div className="mt-1 text-callout text-label-secondary">
              {t("ME_PREF_NOTIFICATIONS_PANEL_PIN_DESC")}
            </div>
          </div>
          <Switch
            checked={notificationPanelPinned}
            onChange={(checked) => setNotificationPanelPinned(Boolean(checked))}
          />
        </div>
      </SettingCard>

      <SettingCard>
        <div className="flex items-center justify-between px-6 py-5 sm:px-6">
          <div>
            <div className="text-callout font-semibold text-label-primary">
              {t("ME_PREF_NAV_BADGE_TITLE")}
            </div>
            <div className="mt-1 text-callout text-label-secondary">
              {t("ME_PREF_NAV_BADGE_DESC")}
            </div>
          </div>
          <Switch
            checked={showNotificationsBadge}
            onChange={(checked) => setShowNotificationsBadge(Boolean(checked))}
          />
        </div>
      </SettingCard>

      <SettingCard>
        <div className="flex items-center justify-between px-6 py-5 sm:px-6">
          <div>
            <div className="text-callout font-semibold text-label-primary">
              {t("ME_PREF_MOTION_REDUCE_TITLE")}
            </div>
            <div className="mt-1 text-callout text-label-secondary">
              {t("ME_PREF_MOTION_REDUCE_DESC")}
            </div>
          </div>
          <Switch
            checked={reduceMotion}
            onChange={(checked) => setReduceMotion(Boolean(checked))}
          />
        </div>
      </SettingCard>
    </div>
  );
}
