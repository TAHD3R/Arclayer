import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { Input } from "@arclayer/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@arclayer/ui/select";
import { Textarea } from "@arclayer/ui/textarea";
import { buildSupportedLocaleOptions } from "@/lib/i18n";

export function LocalizedStringMapField(props: {
  locales: string[];
  /**
   * antd Form.Item injects `value` + `onChange` for controlled fields.
   */
  value?: Record<string, string>;
  onChange?: (next: Record<string, string>) => void;
  multiline?: boolean;
  placeholder?: string;
}) {
  const { t } = useTranslation();
  const locales = props.locales.filter(Boolean);
  const [activeLocale, setActiveLocale] = useState<string>(() => locales[0] ?? "en-US");
  const value = props.value ?? {};
  const onChange = props.onChange ?? (() => {});

  const options = useMemo(() => buildSupportedLocaleOptions(locales, t), [locales, t]);

  const effectiveLocale = locales.includes(activeLocale)
    ? activeLocale
    : (locales[0] ?? activeLocale);
  const currentValue = value[effectiveLocale] ?? "";

  const setValueForLocale = (locale: string, text: string) => {
    const next = { ...value };
    const v = (text || "").trim();
    if (v) next[locale] = v;
    else delete next[locale];
    onChange(next);
  };

  return (
    <div className="grid w-full gap-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-footnote text-label-secondary">
          {t("settings:SETTINGS_I18N_ACTIVE_LOCALE")}
        </span>
        <Select value={effectiveLocale} onValueChange={(value) => setActiveLocale(String(value))}>
          <SelectTrigger className="min-w-35">
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="end" position="popper">
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {props.multiline ? (
        <Textarea
          value={currentValue}
          placeholder={props.placeholder}
          rows={3}
          onChange={(event) => setValueForLocale(effectiveLocale, event.target.value)}
          className="min-h-24 resize-y text-body"
        />
      ) : (
        <Input
          value={currentValue}
          placeholder={props.placeholder}
          onChange={(event) => setValueForLocale(effectiveLocale, event.target.value)}
        />
      )}

      <span className="text-caption text-label-secondary">{t("settings:SETTINGS_I18N_HINT")}</span>
    </div>
  );
}
