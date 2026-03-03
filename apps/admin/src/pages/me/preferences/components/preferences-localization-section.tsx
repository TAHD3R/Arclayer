import { Select } from "antd";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { SettingVerticalItem } from "@celestial/ui/setting-vertical-item";
import { type AppLocale } from "@/lib/i18n";
import { buildTimezoneOptions } from "@/lib/settings/general/localization-options";
import { usePreferencesStore } from "@/stores/use-preference-store";

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

  const languageValue = useMemo(() => {
    if (localePreferenceMode === "workspace") return "workspace";
    if (localePreferenceMode === "browser") return "browser";
    return localePreference ?? locale;
  }, [locale, localePreference, localePreferenceMode]);

  const languageOptions = useMemo(
    () => [
      {
        label: t("ME_PREF_LANGUAGE_GROUP_AUTO"),
        options: [
          { value: "workspace", label: t("ME_PREF_LOCALE_MODE_WORKSPACE") },
          { value: "browser", label: t("ME_PREF_LOCALE_MODE_BROWSER") },
        ],
      },
      {
        label: t("ME_PREF_LANGUAGE_GROUP_MANUAL"),
        options: [
          { value: "zh-CN", label: t("ACCOUNT_LANGUAGE_ZH") },
          { value: "en-US", label: t("ACCOUNT_LANGUAGE_EN") },
        ],
      },
    ],
    [t],
  );

  const timeZoneOptions = useMemo(() => {
    const zoneOptions = buildTimezoneOptions().map((it) => ({ value: it.value, label: it.label }));

    return [
      {
        label: t("ME_PREF_TIMEZONE_GROUP_DEFAULT"),
        options: [{ value: "__auto__", label: t("ME_PREF_TIMEZONE_AUTO") }],
      },
      {
        label: t("ME_PREF_TIMEZONE_GROUP_ALL"),
        options: zoneOptions.length ? zoneOptions : [{ value: "UTC", label: "UTC" }],
      },
    ];
  }, [t]);

  const timeZoneValue = timeZonePreference ?? "__auto__";

  return (
    <div className="flex flex-col gap-8">
      <SettingVerticalItem
        title={t("ME_PREF_TIMEZONE_TITLE")}
        description={t("ME_PREF_TIMEZONE_DESC")}
        control={
          <div className="max-w-96">
            <Select
              value={timeZoneValue}
              showSearch
              options={timeZoneOptions}
              style={{ width: "100%" }}
              onChange={(value) => {
                if (value === "__auto__") {
                  setTimeZonePreference(null);
                  return;
                }
                setTimeZonePreference(String(value));
              }}
              filterOption={(input, option) => {
                const label = String(option?.label ?? "");
                return label.toLowerCase().includes(String(input || "").toLowerCase());
              }}
            />
          </div>
        }
      />

      <SettingVerticalItem
        title={t("ACCOUNT_SETTINGS_LANGUAGE_LABEL")}
        description={t("ME_PREF_LANGUAGE_DESC")}
        control={
          <div className="max-w-96">
            <Select
              value={languageValue}
              options={languageOptions}
              style={{ width: "100%" }}
              onChange={(value) => {
                if (value === "workspace") {
                  setWorkspaceLocaleMode();
                  return;
                }
                if (value === "browser") {
                  setBrowserLocale();
                  return;
                }
                setLocale(value as AppLocale);
              }}
            />
          </div>
        }
      />
    </div>
  );
}
