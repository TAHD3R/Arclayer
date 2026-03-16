import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { SettingCard, SettingCardHeader } from "@arclayer/ui/setting-card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@arclayer/ui/select";
import { Switch } from "@arclayer/ui/switch";
import { type AppLocale } from "@/lib/i18n";
import { buildTimezoneOptions } from "@/lib/settings/general/localization-options";
import { usePreferencesStore } from "@/stores/use-preference-store";

function getBrowserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

type PreferenceSelectCardProps = {
  description: string;
  disabled: boolean;
  onSelectChange: (value: string) => void;
  onSwitchChange: (checked: boolean) => void;
  options: Array<{ label: string; value: string }>;
  selectValue: string;
  switchDescription: string;
  switchLabel: string;
  title: string;
};

function PreferenceSelectCard(props: PreferenceSelectCardProps) {
  return (
    <SettingCard>
      <SettingCardHeader
        title={props.title}
        description={props.description}
        action={
          <div className="flex w-56 flex-col gap-2">
            <div className="flex items-center justify-between gap-3">
              <span className="text-body text-label-primary">{props.switchLabel}</span>
              <Switch checked={props.disabled} onCheckedChange={props.onSwitchChange} />
            </div>
            <div className="text-callout text-label-secondary">{props.switchDescription}</div>
            <Select
              value={props.selectValue}
              disabled={props.disabled}
              onValueChange={props.onSelectChange}
            >
              <SelectTrigger className="w-full" size="default">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper" align="start">
                {props.options.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        }
      />
    </SettingCard>
  );
}

export function MePreferencesLocalizationSection() {
  const { t } = useTranslation("account");

  const locale = usePreferencesStore((s) => s.locale);
  const localePreference = usePreferencesStore((s) => s.localePreference);
  const localePreferenceMode = usePreferencesStore((s) => s.localePreferenceMode);
  const setLocale = usePreferencesStore((s) => s.setLocale);
  const setBrowserLocale = usePreferencesStore((s) => s.setBrowserLocale);
  const setWorkspaceLocaleMode = usePreferencesStore((s) => s.setWorkspaceLocaleMode);
  const timeZonePreference = usePreferencesStore((s) => s.timeZonePreference);
  const setTimeZonePreference = usePreferencesStore((s) => s.setTimeZonePreference);

  const browserTimeZone = useMemo(() => getBrowserTimeZone(), []);
  const isBrowserLanguageEnabled = localePreferenceMode === "browser";
  const isAutoTimezoneEnabled = timeZonePreference === null;

  const languageValue = useMemo(() => {
    if (localePreferenceMode === "workspace") return "workspace";
    if (localePreferenceMode === "browser") return locale;
    return localePreference ?? locale;
  }, [locale, localePreference, localePreferenceMode]);

  const languageOptions = useMemo(
    () => [
      { value: "workspace", label: t("ME_PREF_LOCALE_MODE_WORKSPACE") },
      { value: "zh-CN", label: t("ACCOUNT_LANGUAGE_ZH") },
      { value: "en-US", label: t("ACCOUNT_LANGUAGE_EN") },
    ],
    [t],
  );

  const timeZoneOptions = useMemo(
    () =>
      buildTimezoneOptions(browserTimeZone).map((option) => ({
        value: option.value,
        label: option.label,
      })),
    [browserTimeZone],
  );

  return (
    <div className="flex flex-col gap-6">
      <PreferenceSelectCard
        description={t("ME_PREF_TIMEZONE_DESC")}
        disabled={isAutoTimezoneEnabled}
        onSelectChange={(value) => setTimeZonePreference(value)}
        onSwitchChange={(checked) => {
          if (checked) {
            setTimeZonePreference(null);
            return;
          }
          setTimeZonePreference(browserTimeZone);
        }}
        options={timeZoneOptions}
        selectValue={timeZonePreference ?? browserTimeZone}
        switchDescription={t("ME_PREF_TIMEZONE_AUTO_SWITCH_DESC")}
        switchLabel={t("ME_PREF_TIMEZONE_AUTO_SWITCH_LABEL")}
        title={t("ME_PREF_TIMEZONE_TITLE")}
      />

      <PreferenceSelectCard
        description={t("ME_PREF_LANGUAGE_DESC")}
        disabled={isBrowserLanguageEnabled}
        onSelectChange={(value) => {
          if (value === "workspace") {
            setWorkspaceLocaleMode();
            return;
          }
          setLocale(value as AppLocale);
        }}
        onSwitchChange={(checked) => {
          if (checked) {
            setBrowserLocale();
            return;
          }
          setWorkspaceLocaleMode();
        }}
        options={languageOptions}
        selectValue={languageValue}
        switchDescription={t("ME_PREF_LANGUAGE_BROWSER_SWITCH_DESC")}
        switchLabel={t("ME_PREF_LANGUAGE_BROWSER_SWITCH_LABEL")}
        title={t("ACCOUNT_SETTINGS_LANGUAGE_LABEL")}
      />
    </div>
  );
}
