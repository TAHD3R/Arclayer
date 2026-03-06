import { Select, Switch } from "antd";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { SettingCard, SettingCardHeader } from "@celestial/ui/setting-card";
import { type AppLocale } from "@/lib/i18n";
import { getPopupContainerWithinOverlay } from "@/lib/antd/popup-container";
import { buildTimezoneOptions } from "@/lib/settings/general/localization-options";
import { usePreferencesStore } from "@/stores/use-preference-store";

function getBrowserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
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
      {
        label: t("ME_PREF_LANGUAGE_GROUP_AUTO"),
        options: [{ value: "workspace", label: t("ME_PREF_LOCALE_MODE_WORKSPACE") }],
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
    return buildTimezoneOptions(browserTimeZone).map((it) => ({
      value: it.value,
      label: it.label,
    }));
  }, [browserTimeZone]);

  const timeZoneValue = timeZonePreference ?? browserTimeZone;

  return (
    <div className="flex flex-col gap-6">
      <SettingCard>
        <SettingCardHeader
          title={t("ME_PREF_TIMEZONE_TITLE")}
          description={t("ME_PREF_TIMEZONE_DESC")}
          action={
            <div className="flex w-56 flex-col gap-2">
              <div className="flex items-center justify-between gap-3">
                <span className="text-body text-label-primary">
                  {t("ME_PREF_TIMEZONE_AUTO_SWITCH_LABEL")}
                </span>
                <Switch
                  checked={isAutoTimezoneEnabled}
                  onChange={(checked) => {
                    if (checked) {
                      setTimeZonePreference(null);
                      return;
                    }
                    setTimeZonePreference(browserTimeZone);
                  }}
                />
              </div>
              <div className="text-callout text-label-secondary">
                {t("ME_PREF_TIMEZONE_AUTO_SWITCH_DESC")}
              </div>
              <Select
                value={timeZoneValue}
                disabled={isAutoTimezoneEnabled}
                showSearch
                options={timeZoneOptions}
                style={{ width: "100%" }}
                getPopupContainer={(node) => getPopupContainerWithinOverlay(node)}
                onChange={(value) => {
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
      </SettingCard>

      <SettingCard>
        <SettingCardHeader
          title={t("ACCOUNT_SETTINGS_LANGUAGE_LABEL")}
          description={t("ME_PREF_LANGUAGE_DESC")}
          action={
            <div className="flex w-56 flex-col gap-2">
              <div className="flex items-center justify-between gap-3">
                <span className="text-body text-label-primary">
                  {t("ME_PREF_LANGUAGE_BROWSER_SWITCH_LABEL")}
                </span>
                <Switch
                  checked={isBrowserLanguageEnabled}
                  onChange={(checked) => {
                    if (checked) {
                      setBrowserLocale();
                      return;
                    }
                    setWorkspaceLocaleMode();
                  }}
                />
              </div>
              <div className="text-callout text-label-secondary">
                {t("ME_PREF_LANGUAGE_BROWSER_SWITCH_DESC")}
              </div>
              <Select
                value={languageValue}
                disabled={isBrowserLanguageEnabled}
                options={languageOptions}
                style={{ width: "100%" }}
                getPopupContainer={(node) => getPopupContainerWithinOverlay(node)}
                onChange={(value) => {
                  if (value === "workspace") {
                    setWorkspaceLocaleMode();
                    return;
                  }
                  setLocale(value as AppLocale);
                }}
              />
            </div>
          }
        />
      </SettingCard>
    </div>
  );
}
