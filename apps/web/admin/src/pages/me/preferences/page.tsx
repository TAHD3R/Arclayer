import { Select, Switch } from "antd";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { SettingPanel } from "@/components/settings-primitives/setting-panel";
import { SettingActionItem } from "@/components/settings-primitives/setting-action-item";
import { cn } from "@/lib/utils";
import { type AppLocale, DEFAULT_LOCALE } from "@/lib/i18n";
import { usePreferencesStore } from "@/stores/use-preference-store";
import type { ThemePreference } from "@/types/stores";

function ThemeModeIcon(props: { mode: ThemePreference }) {
  const stroke = "currentColor";
  const common = { stroke, strokeWidth: 1.5, fill: "none" } as const;

  if (props.mode === "system") {
    return (
      <svg viewBox="0 0 64 40" className="h-10 w-16">
        <rect x="6" y="6" width="52" height="28" rx="6" {...common} />
        <path d="M22 28c4-10 16-10 20 0" {...common} />
        <path d="M30 14h4" {...common} />
      </svg>
    );
  }

  if (props.mode === "dark") {
    return (
      <svg viewBox="0 0 64 40" className="h-10 w-16">
        <rect x="6" y="6" width="52" height="28" rx="6" {...common} />
        <path d="M40 15c-4 1-7 5-7 9 0 5 4 9 9 9 4 0 7-2 8-6" {...common} />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 64 40" className="h-10 w-16">
      <rect x="6" y="6" width="52" height="28" rx="6" {...common} />
      <circle cx="32" cy="20" r="8" {...common} />
      <path d="M32 8v4M32 28v4M20 20h-4M48 20h-4" {...common} />
    </svg>
  );
}

function ThemeCard(props: {
  value: ThemePreference;
  selected: boolean;
  label: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={props.onSelect}
      className={cn(
        "w-full rounded-lg border p-4 text-left",
        "transition-colors",
        props.selected
          ? "border-foreground bg-muted text-foreground"
          : "border-border bg-card hover:bg-muted/60",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-headline font-semibold">{props.label}</div>
        </div>
        <div className={cn("text-label-secondary", props.selected ? "text-foreground" : null)}>
          <ThemeModeIcon mode={props.value} />
        </div>
      </div>
    </button>
  );
}

export function MePreferencesPage() {
  const { t } = useTranslation("account");
  const themePreference = usePreferencesStore((s) => s.themePreference);
  const setThemePreference = usePreferencesStore((s) => s.setThemePreference);

  const locale = usePreferencesStore((s) => s.locale);
  const localePreference = usePreferencesStore((s) => s.localePreference);
  const localePreferenceMode = usePreferencesStore((s) => s.localePreferenceMode);
  const setLocale = usePreferencesStore((s) => s.setLocale);
  const setBrowserLocale = usePreferencesStore((s) => s.setBrowserLocale);
  const setWorkspaceLocaleMode = usePreferencesStore((s) => s.setWorkspaceLocaleMode);

  const notificationPanelPinned = usePreferencesStore((s) => s.notificationPanelPinned);
  const setNotificationPanelPinned = usePreferencesStore((s) => s.setNotificationPanelPinned);

  const languageOptions = useMemo(
    () =>
      [
        { value: "zh-CN", label: t("ACCOUNT_LANGUAGE_ZH") },
        { value: "en-US", label: t("ACCOUNT_LANGUAGE_EN") },
      ] satisfies Array<{ value: AppLocale; label: string }>,
    [t],
  );

  const localeModeSummary =
    localePreferenceMode === "explicit"
      ? t("ME_PREF_LOCALE_MODE_EXPLICIT")
      : localePreferenceMode === "browser"
        ? t("ME_PREF_LOCALE_MODE_BROWSER")
        : t("ME_PREF_LOCALE_MODE_WORKSPACE");

  return (
    <div className="flex flex-col gap-8">
      <SettingPanel
        title={t("ME_PREF_APPEARANCE_PANEL_TITLE")}
        description={t("ME_PREF_APPEARANCE_PANEL_DESC")}
      >
        <div className="grid gap-3 md:grid-cols-3">
          <ThemeCard
            value="system"
            selected={themePreference === "system"}
            label={t("ACCOUNT_THEME_SYSTEM")}
            onSelect={() => setThemePreference("system")}
          />
          <ThemeCard
            value="light"
            selected={themePreference === "light"}
            label={t("ACCOUNT_THEME_LIGHT")}
            onSelect={() => setThemePreference("light")}
          />
          <ThemeCard
            value="dark"
            selected={themePreference === "dark"}
            label={t("ACCOUNT_THEME_DARK")}
            onSelect={() => setThemePreference("dark")}
          />
        </div>
      </SettingPanel>

      <SettingPanel
        title={t("ME_PREF_LOCALE_PANEL_TITLE")}
        description={t("ME_PREF_LOCALE_PANEL_DESC")}
      >
        <div className="rounded-lg border border-border bg-card">
          <SettingActionItem
            as="div"
            title={t("ACCOUNT_SETTINGS_LANGUAGE_LABEL")}
            description={t("ME_PREF_LOCALE_ITEM_DESC")}
            summary={localeModeSummary}
            showChevron={false}
            right={
              <Select
                value={localePreferenceMode}
                onChange={(value) => {
                  if (value === "explicit") {
                    setLocale(localePreference ?? locale ?? DEFAULT_LOCALE);
                    return;
                  }
                  if (value === "browser") {
                    setBrowserLocale();
                    return;
                  }
                  setWorkspaceLocaleMode();
                }}
                style={{ width: 180 }}
                options={[
                  { value: "workspace", label: t("ME_PREF_LOCALE_MODE_WORKSPACE") },
                  { value: "browser", label: t("ME_PREF_LOCALE_MODE_BROWSER") },
                  { value: "explicit", label: t("ME_PREF_LOCALE_MODE_EXPLICIT") },
                ]}
              />
            }
          />

          {localePreferenceMode === "explicit" ? (
            <div className="px-4 pb-4">
              <div className="max-w-96">
                <Select
                  value={localePreference ?? locale}
                  onChange={(next) => setLocale(next)}
                  options={languageOptions}
                  style={{ width: "100%" }}
                />
              </div>
            </div>
          ) : null}
        </div>
      </SettingPanel>

      <SettingPanel
        title={t("ME_PREF_NOTIFICATIONS_PANEL_TITLE")}
        description={t("ME_PREF_NOTIFICATIONS_PANEL_DESC")}
      >
        <div className="rounded-lg border border-border bg-card">
          <SettingActionItem
            as="div"
            title={t("ME_PREF_NOTIFICATIONS_PANEL_PIN_TITLE")}
            description={t("ME_PREF_NOTIFICATIONS_PANEL_PIN_DESC")}
            showChevron={false}
            showSummary={false}
            right={
              <Switch
                checked={notificationPanelPinned}
                onChange={(checked) => setNotificationPanelPinned(Boolean(checked))}
              />
            }
          />
        </div>
      </SettingPanel>

      <SettingPanel
        title={t("ME_PREF_MOTION_PANEL_TITLE")}
        description={t("ME_PREF_MOTION_PANEL_DESC")}
      >
        <div className="rounded-lg border border-border bg-card">
          <SettingActionItem
            as="div"
            title={t("ME_PREF_MOTION_REDUCE_TITLE")}
            description={t("ME_PREF_MOTION_REDUCE_DESC")}
            showChevron={false}
            showSummary={false}
            right={<Switch disabled checked={false} />}
          />
        </div>
      </SettingPanel>
    </div>
  );
}
