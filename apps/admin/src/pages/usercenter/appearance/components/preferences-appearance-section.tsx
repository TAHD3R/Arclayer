import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, RotateCcw } from "lucide-react";

import { cn } from "@arclayer/lib/utils";
import { Alert, AlertDescription, AlertTitle } from "@arclayer/ui/alert";
import { Button } from "@arclayer/ui/button";
import { SettingCard, SettingCardContent, SettingCardHeader } from "@arclayer/ui/setting-card";
import { Slider } from "@arclayer/ui/slider";
import { Switch } from "@arclayer/ui/switch";
import { setThemePreferenceWithTransition } from "@/components/ui/theme-transition";
import { ThemeCard } from "@/pages/usercenter/appearance/components/preferences-theme-cards";
import { usePreferencesStore } from "@/stores/use-preference-store";

type PreferenceToggleCardProps = {
  checked: boolean;
  description: string;
  onCheckedChange: (checked: boolean) => void;
  title: string;
};

function WarningAlert(props: { description: string; title: string }) {
  return (
    <Alert className="mb-6 border-amber-500/30 bg-amber-500/8 text-amber-900 dark:text-amber-100">
      <AlertTriangle className="text-amber-600 dark:text-amber-300" />
      <AlertTitle>{props.title}</AlertTitle>
      <AlertDescription>{props.description}</AlertDescription>
    </Alert>
  );
}

function ResetAction(props: { hidden: boolean; label: string; onClick: () => void }) {
  return (
    <Button
      size="sm"
      variant="secondary"
      className={props.hidden ? "hidden" : undefined}
      onClick={props.onClick}
    >
      <RotateCcw className="size-3.5" />
      {props.label}
    </Button>
  );
}

function PreferenceToggleCard(props: PreferenceToggleCardProps) {
  return (
    <SettingCard>
      <div className="flex items-center justify-between px-6 py-5 sm:px-6">
        <div>
          <div className="text-callout font-semibold text-label-primary">{props.title}</div>
          <div className="mt-1 text-callout text-label-secondary">{props.description}</div>
        </div>
        <Switch checked={props.checked} onCheckedChange={props.onCheckedChange} />
      </div>
    </SettingCard>
  );
}

type PreferenceSliderCardProps = {
  alertDescription: string;
  alertTitle: string;
  currentLabel: string;
  description: string;
  hideReset: boolean;
  leftPreviewClassName: string;
  max: number;
  min: number;
  onChange: (value: number) => void;
  onReset: () => void;
  rightPreviewClassName: string;
  sliderClassName?: string;
  step: number;
  title: string;
  value: number;
  warningVisible: boolean;
};

function PreferenceSliderCard(props: PreferenceSliderCardProps) {
  return (
    <SettingCard>
      <SettingCardHeader
        title={props.title}
        description={props.description}
        action={
          <ResetAction
            hidden={props.hideReset}
            label={props.currentLabel}
            onClick={props.onReset}
          />
        }
      />
      <SettingCardContent>
        <div className="max-w-xl">
          {props.warningVisible ? (
            <WarningAlert title={props.alertTitle} description={props.alertDescription} />
          ) : null}

          <div className="flex items-center gap-3">
            <div
              className={cn(
                "shrink-0 select-none text-title2  text-label-secondary",
                props.leftPreviewClassName,
              )}
            >
              Aa
            </div>
            <Slider
              className={cn("me-typography-slider w-64 md:w-80", props.sliderClassName)}
              min={props.min}
              max={props.max}
              step={props.step}
              value={[props.value]}
              onValueChange={(values) => {
                const nextValue = values[0];
                if (typeof nextValue === "number") {
                  props.onChange(nextValue);
                }
              }}
            />
            <div
              className={cn(
                "shrink-0 select-none text-largetitle  text-label-secondary",
                props.rightPreviewClassName,
              )}
            >
              Aa
            </div>
            <div className="min-w-12 text-right text-footnote tabular-nums text-label-secondary">
              {props.currentLabel}
            </div>
          </div>
        </div>
      </SettingCardContent>
    </SettingCard>
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
  const fontScalePreference = usePreferencesStore((s) => s.fontScalePreference);
  const setFontScalePreference = usePreferencesStore((s) => s.setFontScalePreference);
  const fontWeightPreference = usePreferencesStore((s) => s.fontWeightPreference);
  const setFontWeightPreference = usePreferencesStore((s) => s.setFontWeightPreference);

  const fontScale = fontScalePreference ?? 1;
  const fontWeight = fontWeightPreference ?? 400;
  const fontScaleLabel = `${Math.round(fontScale * 100)}%`;
  const fontWeightLabel = String(fontWeight);

  const showFontScaleAlert = useMemo(() => fontScale <= 0.9 || fontScale >= 1.2, [fontScale]);
  const showFontWeightAlert = useMemo(() => fontWeight <= 320 || fontWeight >= 650, [fontWeight]);

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

      <PreferenceSliderCard
        alertDescription={t("ME_PREF_TEXT_SIZE_ALERT_DESC")}
        alertTitle={t("ME_PREF_TEXT_SIZE_ALERT_TITLE")}
        currentLabel={fontScaleLabel}
        description={t("ME_PREF_TEXT_SIZE_DESC")}
        hideReset={fontScalePreference === null}
        leftPreviewClassName=""
        max={1.25}
        min={0.85}
        onChange={setFontScalePreference}
        onReset={() => setFontScalePreference(null)}
        rightPreviewClassName=""
        step={0.05}
        title={t("ME_PREF_TEXT_SIZE_TITLE")}
        value={fontScale}
        warningVisible={showFontScaleAlert}
      />

      <PreferenceSliderCard
        alertDescription={t("ME_PREF_TEXT_WEIGHT_ALERT_DESC")}
        alertTitle={t("ME_PREF_TEXT_WEIGHT_ALERT_TITLE")}
        currentLabel={fontWeightLabel}
        description={t("ME_PREF_TEXT_WEIGHT_DESC")}
        hideReset={fontWeightPreference === null}
        leftPreviewClassName="font-light"
        max={700}
        min={300}
        onChange={setFontWeightPreference}
        onReset={() => setFontWeightPreference(null)}
        rightPreviewClassName="font-bold"
        step={25}
        title={t("ME_PREF_TEXT_WEIGHT_TITLE")}
        value={fontWeight}
        warningVisible={showFontWeightAlert}
      />

      <PreferenceToggleCard
        checked={contrastMore}
        description={t("ME_PREF_CONTRAST_DESC")}
        onCheckedChange={setContrastMore}
        title={t("ME_PREF_CONTRAST_TITLE")}
      />

      <PreferenceToggleCard
        checked={notificationPanelPinned}
        description={t("ME_PREF_NOTIFICATIONS_PANEL_PIN_DESC")}
        onCheckedChange={setNotificationPanelPinned}
        title={t("ME_PREF_NOTIFICATIONS_PANEL_PIN_TITLE")}
      />

      <PreferenceToggleCard
        checked={showNotificationsBadge}
        description={t("ME_PREF_NAV_BADGE_DESC")}
        onCheckedChange={setShowNotificationsBadge}
        title={t("ME_PREF_NAV_BADGE_TITLE")}
      />

      <PreferenceToggleCard
        checked={reduceMotion}
        description={t("ME_PREF_MOTION_REDUCE_DESC")}
        onCheckedChange={setReduceMotion}
        title={t("ME_PREF_MOTION_REDUCE_TITLE")}
      />
    </div>
  );
}
