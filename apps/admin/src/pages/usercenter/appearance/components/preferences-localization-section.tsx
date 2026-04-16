import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@arclayer/ui/select";
import { Switch } from "@arclayer/ui/switch";
import { buildSupportedLocaleOptions, SUPPORTED_LOCALES, type AppLocale } from "@/lib/i18n";
import { buildTimezoneOptions } from "@/lib/settings/general/localization-options";
import { PreferenceSettingRow } from "@/pages/usercenter/appearance/components/preference-setting-row";
import { usePreferencesStore } from "@/stores/use-preference-store";

function getBrowserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

type PreferenceSelectRowProps = {
  description: string;
  disabled: boolean;
  onSelectChange: (value: string) => void;
  options: Array<{ label: string; value: string }>;
  selectValue: string;
  title: string;
};

function PreferenceSelectRow(props: PreferenceSelectRowProps) {
  return (
    <PreferenceSettingRow
      title={props.title}
      description={props.description}
      action={
        <Select
          value={props.selectValue}
          disabled={props.disabled}
          onValueChange={props.onSelectChange}
        >
          <SelectTrigger className="w-56" size="default">
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper" align="end">
            {props.options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      }
    />
  );
}

function PreferenceSwitchRow(props: {
  checked: boolean;
  description: string;
  onCheckedChange: (checked: boolean) => void;
  title: string;
}) {
  return (
    <PreferenceSettingRow
      title={props.title}
      description={props.description}
      action={<Switch checked={props.checked} onCheckedChange={props.onCheckedChange} />}
    />
  );
}

export function UserLocalizationSection() {
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
      ...buildSupportedLocaleOptions(SUPPORTED_LOCALES, t),
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
      <PreferenceSelectRow
        description={t("ME_PREF_TIMEZONE_DESC")}
        disabled={isAutoTimezoneEnabled}
        onSelectChange={(value) => setTimeZonePreference(value)}
        options={timeZoneOptions}
        selectValue={timeZonePreference ?? browserTimeZone}
        title={t("ME_PREF_TIMEZONE_TITLE")}
      />

      <PreferenceSwitchRow
        checked={isAutoTimezoneEnabled}
        description={t("ME_PREF_TIMEZONE_AUTO_SWITCH_DESC")}
        onCheckedChange={(checked) => {
          if (checked) {
            setTimeZonePreference(null);
            return;
          }
          setTimeZonePreference(browserTimeZone);
        }}
        title={t("ME_PREF_TIMEZONE_AUTO_SWITCH_LABEL")}
      />

      <PreferenceSelectRow
        description={t("ME_PREF_LANGUAGE_DESC")}
        disabled={isBrowserLanguageEnabled}
        onSelectChange={(value) => {
          if (value === "workspace") {
            setWorkspaceLocaleMode();
            return;
          }
          setLocale(value as AppLocale);
        }}
        options={languageOptions}
        selectValue={languageValue}
        title={t("ACCOUNT_SETTINGS_LANGUAGE_LABEL")}
      />

      <PreferenceSwitchRow
        checked={isBrowserLanguageEnabled}
        description={t("ME_PREF_LANGUAGE_BROWSER_SWITCH_DESC")}
        onCheckedChange={(checked) => {
          if (checked) {
            setBrowserLocale();
            return;
          }
          setWorkspaceLocaleMode();
        }}
        title={t("ME_PREF_LANGUAGE_BROWSER_SWITCH_LABEL")}
      />
    </div>
  );
}
