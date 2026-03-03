import type { LocalizedString } from "@celestial/block-protocol";
import { Button, Input, Select, Space, Switch, Typography } from "antd";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

export function LocalizedStringField(props: {
  supportedLocales: string[];
  defaultLocale: string;
  value: LocalizedString | null | undefined;
  onChange: (next: LocalizedString) => void;
  multiline?: boolean;
  placeholder?: string;
}) {
  const { t } = useTranslation(["editor"]);
  const supportedLocales = (props.supportedLocales || []).filter(Boolean);
  const defaultLocale = (props.defaultLocale || "").trim() || supportedLocales[0] || "en-US";

  const value = props.value ?? {};
  const hasAnyI18n = Object.keys(value).some((k) => (value as Record<string, unknown>)[k] != null);
  const [i18nEnabled, setI18nEnabled] = useState<boolean>(
    () => hasAnyI18n && Object.keys(value).length > 1,
  );
  const [activeLocale, setActiveLocale] = useState<string>(() => defaultLocale);

  const locales = supportedLocales.length ? supportedLocales : [defaultLocale];
  const options = useMemo(() => locales.map((loc) => ({ value: loc, label: loc })), [locales]);

  const effectiveLocale = locales.includes(activeLocale) ? activeLocale : defaultLocale;

  const Editor = props.multiline ? Input.TextArea : Input;

  const normalizeMap = (input: LocalizedString): LocalizedString => {
    const out: LocalizedString = {};
    for (const [k, v] of Object.entries(input || {})) {
      const key = String(k || "").trim();
      const val = typeof v === "string" ? v.trim() : "";
      if (!key || !val) continue;
      out[key] = val;
    }
    return out;
  };

  const collapseToSingle = (map: LocalizedString): LocalizedString => {
    const normalized = normalizeMap(map);
    const resolved =
      (normalized[defaultLocale] || "").trim() ||
      Object.values(normalized).find((v) => typeof v === "string" && v.trim()) ||
      "";
    return resolved ? { [defaultLocale]: resolved } : {};
  };

  const setTextForLocale = (locale: string, text: string) => {
    const next = normalizeMap({ ...value });
    const v = (text || "").trim();
    if (v) next[locale] = v;
    else delete next[locale];
    props.onChange(next);
  };

  const singleValue =
    (value[defaultLocale] || "").trim() ||
    Object.values(value).find((v) => typeof v === "string" && v.trim()) ||
    "";

  return (
    <Space direction="vertical" size={10} className="w-full">
      <div className="flex items-center justify-between gap-3">
        <Typography.Text type="secondary">{t("editor:EDITOR_I18N_FIELD_ENABLED")}</Typography.Text>
        <Switch
          checked={i18nEnabled}
          onChange={(checked) => {
            setI18nEnabled(Boolean(checked));
            if (!checked) {
              props.onChange(collapseToSingle(value));
              setActiveLocale(defaultLocale);
            } else {
              // Ensure default locale exists when toggling on.
              const next = normalizeMap(value);
              if (!Object.keys(next).length && singleValue) {
                next[defaultLocale] = String(singleValue).trim();
              }
              props.onChange(next);
            }
          }}
        />
      </div>

      {i18nEnabled ? (
        <>
          <div className="flex items-center justify-between gap-3">
            <Typography.Text type="secondary">
              {t("editor:EDITOR_I18N_FIELD_LOCALE")}
            </Typography.Text>
            <Select
              value={effectiveLocale}
              options={options}
              onChange={(v) => setActiveLocale(String(v))}
              style={{ minWidth: 160 }}
            />
          </div>
          <Editor
            value={value[effectiveLocale] ?? ""}
            placeholder={props.placeholder}
            autoSize={props.multiline ? { minRows: 3, maxRows: 6 } : undefined}
            onChange={(e) => setTextForLocale(effectiveLocale, e.target.value)}
          />
          <div className="flex justify-end">
            <Button
              size="small"
              onClick={() => {
                const defVal = (value[defaultLocale] || "").trim();
                if (!defVal) return;
                setTextForLocale(effectiveLocale, defVal);
              }}
              disabled={effectiveLocale === defaultLocale || !(value[defaultLocale] || "").trim()}
            >
              {t("editor:EDITOR_I18N_FIELD_COPY_DEFAULT")}
            </Button>
          </div>
        </>
      ) : (
        <Editor
          value={singleValue}
          placeholder={props.placeholder}
          autoSize={props.multiline ? { minRows: 3, maxRows: 6 } : undefined}
          onChange={(e) => props.onChange(collapseToSingle({ [defaultLocale]: e.target.value }))}
        />
      )}

      <Typography.Text type="secondary" className="text-xs">
        {t("editor:EDITOR_I18N_FIELD_HINT")}
      </Typography.Text>
    </Space>
  );
}
