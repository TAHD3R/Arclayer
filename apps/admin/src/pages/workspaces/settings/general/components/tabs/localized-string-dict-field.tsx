import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { cn } from "@celestial/lib/utils";
import { Button } from "@celestial/ui/button";
import { Checkbox } from "@celestial/ui/checkbox";
import { Input } from "@celestial/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@celestial/ui/select";

type LocaleRow = {
  locale: string;
};

export function LocalizedStringDictField(props: {
  supportedLocales: string[];
  defaultLocale: string;
  /**
   * antd Form.Item injects `value` + `onChange` for controlled fields.
   */
  value?: Record<string, string>;
  onChange?: (next: Record<string, string>) => void;
  /**
   * Optional callback to update site default locale.
   *
   * The caller decides where it is stored (we use workspace core settings
   * `site_localization.default_locale`).
   */
  onDefaultLocaleChange?: (next: string) => void;
  multiline?: boolean;
  placeholder?: string;
}) {
  const { t } = useTranslation();
  const supportedLocales = (props.supportedLocales || []).filter(Boolean);
  const defaultLocale = (props.defaultLocale || "").trim() || supportedLocales[0] || "en-US";

  const value = props.value ?? {};
  const onChange = props.onChange ?? (() => {});
  const onDefaultLocaleChange = props.onDefaultLocaleChange ?? (() => {});

  const [rows, setRows] = useState<LocaleRow[]>(() => {
    const keys = Object.keys(value || {});
    const locales = uniq([defaultLocale, ...keys]).filter(Boolean);
    return locales.map((locale) => ({ locale }));
  });

  useEffect(() => {
    // Keep default locale row always visible.
    setRows((prev) => {
      const current = new Set(prev.map((r) => r.locale));
      if (current.has(defaultLocale)) return prev;
      return [{ locale: defaultLocale }, ...prev];
    });
  }, [defaultLocale]);

  useEffect(() => {
    // If `value` gains new locale keys externally, ensure they show up.
    setRows((prev) => {
      const current = new Set(prev.map((r) => r.locale));
      const keys = Object.keys(value || {}).filter(Boolean);
      const missing = keys.filter((k) => !current.has(k));
      if (!missing.length) return prev;
      return [...prev, ...missing.map((locale) => ({ locale }))];
    });
  }, [value]);

  const usedLocales = useMemo(() => new Set(rows.map((r) => r.locale)), [rows]);
  const addableLocaleOptions = useMemo(() => {
    const pool = supportedLocales.length ? supportedLocales : Object.keys(value || {});
    return pool
      .filter((loc) => loc && !usedLocales.has(loc))
      .map((loc) => ({ value: loc, label: loc }));
  }, [supportedLocales, usedLocales, value]);
  const [pendingLocale, setPendingLocale] = useState<string | undefined>(undefined);

  const setValueForLocale = (locale: string, text: string) => {
    const next = { ...value };
    const v = (text || "").trim();
    if (v) next[locale] = v;
    else delete next[locale];
    onChange(next);
  };

  const removeLocale = (locale: string) => {
    if (locale === defaultLocale) return;
    setRows((prev) => prev.filter((r) => r.locale !== locale));
    const next = { ...value };
    delete next[locale];
    onChange(next);
  };

  const addLocale = (locale: string) => {
    const loc = String(locale || "").trim();
    if (!loc) return;
    if (usedLocales.has(loc)) return;
    setRows((prev) => [...prev, { locale: loc }]);
    setPendingLocale(undefined);
  };

  return (
    <div className="grid w-full gap-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-footnote text-label-secondary">
          {t("settings:SETTINGS_I18N_LOCALES")}
        </span>
        <Select
          value={pendingLocale}
          onValueChange={(value) => addLocale(String(value))}
          disabled={!addableLocaleOptions.length}
        >
          <SelectTrigger className="min-w-55">
            <SelectValue placeholder={t("settings:SETTINGS_I18N_ADD_LOCALE")} />
          </SelectTrigger>
          <SelectContent align="end" position="popper">
            {addableLocaleOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid w-full gap-2.5">
        {rows.map((row) => {
          const locale = row.locale;
          const isDefault = locale === defaultLocale;
          const currentValue = value?.[locale] ?? "";
          return (
            <div key={locale} className="rounded-md border border-border p-3">
              <div className="mb-2 flex items-center justify-between gap-3">
                <span className="font-mono text-footnote">{locale}</span>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 text-footnote text-label-secondary">
                    <Checkbox
                      checked={isDefault}
                      onCheckedChange={() => onDefaultLocaleChange(locale)}
                    />
                    <span>{t("settings:SETTINGS_I18N_DEFAULT_LOCALE")}</span>
                  </label>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    onClick={() => removeLocale(locale)}
                    disabled={isDefault}
                  >
                    {t("settings:SETTINGS_I18N_REMOVE_LOCALE")}
                  </Button>
                </div>
              </div>

              {props.multiline ? (
                <textarea
                  value={currentValue}
                  placeholder={props.placeholder}
                  rows={3}
                  onChange={(event) => setValueForLocale(locale, event.target.value)}
                  className={cn(
                    "min-h-24 w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 text-body shadow-sm transition-colors",
                    "placeholder:text-label-secondary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                  )}
                />
              ) : (
                <Input
                  value={currentValue}
                  placeholder={props.placeholder}
                  onChange={(event) => setValueForLocale(locale, event.target.value)}
                />
              )}
            </div>
          );
        })}
      </div>

      <span className="text-caption text-label-secondary">{t("settings:SETTINGS_I18N_HINT")}</span>
    </div>
  );
}

function uniq(input: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of input) {
    const s = String(item || "").trim();
    if (!s) continue;
    const key = s;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}
