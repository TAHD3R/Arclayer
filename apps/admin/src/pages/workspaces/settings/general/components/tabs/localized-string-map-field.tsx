import { Input, Select, Space, Typography } from "antd";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

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

  const options = useMemo(() => locales.map((loc) => ({ value: loc, label: loc })), [locales]);

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

  const Editor = props.multiline ? Input.TextArea : Input;

  return (
    <Space direction="vertical" size={8} className="w-full">
      <div className="flex items-center justify-between gap-3">
        <Typography.Text type="secondary">
          {t("settings:SETTINGS_I18N_ACTIVE_LOCALE")}
        </Typography.Text>
        <Select
          value={effectiveLocale}
          options={options}
          onChange={(v) => setActiveLocale(String(v))}
          style={{ minWidth: 140 }}
        />
      </div>

      <Editor
        value={currentValue}
        placeholder={props.placeholder}
        autoSize={props.multiline ? { minRows: 3, maxRows: 6 } : undefined}
        onChange={(e) => setValueForLocale(effectiveLocale, e.target.value)}
      />

      <Typography.Text type="secondary" className="text-caption">
        {t("settings:SETTINGS_I18N_HINT")}
      </Typography.Text>
    </Space>
  );
}
