import { Button, Checkbox, Input, Select, Space, Typography } from "antd";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

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

  const Editor = props.multiline ? Input.TextArea : Input;

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
  };

  return (
    <Space direction="vertical" size={12} className="w-full">
      <div className="flex items-center justify-between gap-3">
        <Typography.Text type="secondary">{t("settings:SETTINGS_I18N_LOCALES")}</Typography.Text>
        <Select
          placeholder={t("settings:SETTINGS_I18N_ADD_LOCALE")}
          options={addableLocaleOptions}
          value={undefined}
          onChange={(v) => addLocale(String(v))}
          style={{ minWidth: 220 }}
          disabled={!addableLocaleOptions.length}
        />
      </div>

      <Space direction="vertical" size={10} className="w-full">
        {rows.map((row) => {
          const locale = row.locale;
          const isDefault = locale === defaultLocale;
          const currentValue = value?.[locale] ?? "";
          return (
            <div key={locale} className="rounded-md border border-border p-3">
              <div className="mb-2 flex items-center justify-between gap-3">
                <Typography.Text className="font-mono">{locale}</Typography.Text>
                <Space size={10}>
                  <Checkbox checked={isDefault} onChange={() => onDefaultLocaleChange(locale)}>
                    {t("settings:SETTINGS_I18N_DEFAULT_LOCALE")}
                  </Checkbox>
                  <Button
                    size="small"
                    danger
                    type="text"
                    onClick={() => removeLocale(locale)}
                    disabled={isDefault}
                    autoInsertSpace={false}
                  >
                    {t("settings:SETTINGS_I18N_REMOVE_LOCALE")}
                  </Button>
                </Space>
              </div>

              <Editor
                value={currentValue}
                placeholder={props.placeholder}
                autoSize={props.multiline ? { minRows: 3, maxRows: 6 } : undefined}
                onChange={(e) => setValueForLocale(locale, e.target.value)}
              />
            </div>
          );
        })}
      </Space>

      <Typography.Text type="secondary" className="text-xs">
        {t("settings:SETTINGS_I18N_HINT")}
      </Typography.Text>
    </Space>
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
