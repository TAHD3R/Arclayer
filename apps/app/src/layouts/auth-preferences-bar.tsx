import { Languages, Monitor, Moon, Sun } from "lucide-react";
import type { ReactNode } from "react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { LocaleFlag } from "@/components/ui/tags";
import { setThemePreferenceWithTransition } from "@/components/ui/theme-transition";
import {
  applyLanguagePreferenceValue,
  buildLanguagePreferenceOptions,
  buildThemePreferenceOptions,
  resolveAuthLanguagePreferenceValue,
  type LanguagePreferenceValue,
} from "@/components/settings/preference-options";
import { usePreferencesStore } from "@/stores/use-preference-store";
import { cn } from "@arclayer/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@arclayer/ui/select";
import type { ThemePreference } from "@/types/stores";

function LocaleOptionContent(props: { value: string; label: string }) {
  if (props.value === "browser") {
    return (
      <span className="inline-flex min-w-0 items-center gap-2">
        <Languages className="size-4" aria-hidden="true" />
        <span className="truncate">{props.label}</span>
      </span>
    );
  }

  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      <LocaleFlag locale={props.value} className="shrink-0 text-body" />
      <span className="truncate">{props.label}</span>
    </span>
  );
}

function getThemeIcon(value: ThemePreference): ReactNode {
  if (value === "system") return <Monitor className="size-4" aria-hidden="true" />;
  if (value === "dark") return <Moon className="size-4" aria-hidden="true" />;
  return <Sun className="size-4" aria-hidden="true" />;
}

function ThemeOptionContent(props: { value: ThemePreference; label: string }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      {getThemeIcon(props.value)}
      <span className="truncate">{props.label}</span>
    </span>
  );
}

export function AuthPreferencesBar(props: {
  trailing?: ReactNode;
  placement?: "footer" | "header";
}) {
  const { t } = useTranslation("account");
  const locale = usePreferencesStore((s) => s.locale);
  const localePreference = usePreferencesStore((s) => s.localePreference);
  const localePreferenceMode = usePreferencesStore((s) => s.localePreferenceMode);
  const setLocale = usePreferencesStore((s) => s.setLocale);
  const setBrowserLocale = usePreferencesStore((s) => s.setBrowserLocale);
  const themePreference = usePreferencesStore((s) => s.themePreference);

  const localeOptions = useMemo(
    () => buildLanguagePreferenceOptions(t, { defaultMode: "browser" }),
    [t],
  );
  const themeOptions = useMemo(() => buildThemePreferenceOptions(t), [t]);
  const languageValue = resolveAuthLanguagePreferenceValue({
    locale,
    localePreference,
    localePreferenceMode,
  });
  const selectedLocaleOption = localeOptions.find((option) => option.value === languageValue);
  const selectedThemeOption = themeOptions.find((option) => option.value === themePreference);
  const languageLabel = t("ACCOUNT_SETTINGS_LANGUAGE_LABEL");
  const themeLabel = t("ACCOUNT_SETTINGS_THEME_LABEL");
  const placement = props.placement ?? "footer";
  const isHeader = placement === "header";

  return (
    <div
      data-testid="auth-preferences-bar"
      className={cn(
        "flex shrink-0 justify-center",
        isHeader
          ? "bg-transparent p-0"
          : "bg-background px-4 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]",
      )}
    >
      <div
        className={cn(
          "flex min-w-0 flex-nowrap items-center justify-center whitespace-nowrap text-callout text-label-secondary",
          isHeader ? "w-auto gap-x-1 overflow-visible" : "w-full gap-x-2 overflow-hidden",
        )}
      >
        <Select
          value={languageValue}
          onValueChange={(value) =>
            applyLanguagePreferenceValue(value as LanguagePreferenceValue, {
              setLocale,
              setBrowserLocale,
            })
          }
        >
          <SelectTrigger
            aria-label={languageLabel}
            showIndicator={!isHeader}
            className={cn(
              "shrink border-transparent bg-transparent !text-callout text-label-primary shadow-none hover:bg-muted/60",
              isHeader
                ? "size-8 min-w-8 justify-center rounded-full p-0"
                : "h-8 min-w-0 max-w-[10rem] px-2",
            )}
            size="sm"
          >
            <SelectValue>
              {selectedLocaleOption ? (
                isHeader ? (
                  selectedLocaleOption.value === "browser" ? (
                    <Languages className="size-4" aria-hidden="true" />
                  ) : (
                    <LocaleFlag
                      locale={selectedLocaleOption.value}
                      className="shrink-0 text-body"
                    />
                  )
                ) : (
                  <LocaleOptionContent
                    value={selectedLocaleOption.value}
                    label={selectedLocaleOption.label}
                  />
                )
              ) : null}
            </SelectValue>
          </SelectTrigger>
          <SelectContent position="popper" align="center">
            {localeOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                <LocaleOptionContent value={option.value} label={option.label} />
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {isHeader ? null : <span className="h-4 w-px shrink-0 bg-border" aria-hidden="true" />}
        <Select
          value={themePreference}
          onValueChange={(value) => {
            void setThemePreferenceWithTransition(value as ThemePreference, { direction: "ltr" });
          }}
        >
          <SelectTrigger
            aria-label={themeLabel}
            showIndicator={!isHeader}
            className={cn(
              "shrink border-transparent bg-transparent !text-callout text-label-primary shadow-none hover:bg-muted/60",
              isHeader
                ? "size-8 min-w-8 justify-center rounded-full p-0"
                : "h-8 min-w-0 max-w-[10rem] px-2",
            )}
            size="sm"
          >
            <SelectValue>
              {selectedThemeOption ? (
                isHeader ? (
                  getThemeIcon(selectedThemeOption.value)
                ) : (
                  <ThemeOptionContent
                    value={selectedThemeOption.value}
                    label={selectedThemeOption.label}
                  />
                )
              ) : null}
            </SelectValue>
          </SelectTrigger>
          <SelectContent position="popper" align="center">
            {themeOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                <ThemeOptionContent value={option.value} label={option.label} />
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {props.trailing ? (
          <span className="inline-flex shrink-0 items-center gap-x-2">{props.trailing}</span>
        ) : null}
      </div>
    </div>
  );
}
