import { Languages } from "lucide-react";
import { useState } from "react";
import { Controller } from "react-hook-form";
import { useTranslation } from "react-i18next";

import { Button } from "@arclayer/ui/button";
import { Field, FieldError, FieldGroup } from "@arclayer/ui/field";
import { Input } from "@arclayer/ui/input";
import { SettingDialog } from "@arclayer/ui/setting-dialog";
import { Switch } from "@arclayer/ui/switch";
import { Textarea } from "@arclayer/ui/textarea";

import type { GeneralSettingsTabBaseProps } from "@/types/settings-general";
import { LocalizedStringDictField } from "./localized-string-dict-field";

const DESCRIPTION_MAX_LENGTH = 200;

type LocalizedSiteFieldEditorProps = {
  defaultLocale: string;
  dictName: "siteNameI18n" | "siteDescriptionI18n";
  disabled: boolean;
  enabled: boolean;
  enabledDescription: string;
  enabledLabel: string;
  error: string | null;
  form: GeneralSettingsTabBaseProps["form"];
  inputName: "siteName" | "siteDescription";
  multiline?: boolean;
  placeholder: string;
  rawValue: string;
  supportedLocales: string[];
  onToggle: (checked: boolean) => void;
};

function FieldMessage({ message }: { message: string | null }) {
  if (!message) return null;
  return <FieldError>{message}</FieldError>;
}

export function LocalizedSiteFieldEditor(props: LocalizedSiteFieldEditorProps) {
  const { t } = useTranslation(["settings", "common"]);
  const [translationsOpen, setTranslationsOpen] = useState(false);
  const localizedValues = props.form.watch(props.dictName) ?? {};
  const primaryValue = props.enabled
    ? (localizedValues[props.defaultLocale] ?? props.rawValue)
    : props.rawValue;
  const configuredCount = Object.values(localizedValues).filter((value) => value.trim()).length;

  const setPrimaryValue = (value: string) => {
    props.form.setValue(props.inputName, value, { shouldDirty: true, shouldValidate: true });
    if (!props.enabled) return;
    props.form.setValue(
      props.dictName,
      { ...localizedValues, [props.defaultLocale]: value },
      { shouldDirty: true, shouldValidate: true },
    );
  };

  return (
    <>
      <FieldGroup>
        <Field data-invalid={Boolean(props.error)}>
          {props.multiline ? (
            <Textarea
              value={primaryValue}
              rows={4}
              maxLength={DESCRIPTION_MAX_LENGTH}
              placeholder={props.placeholder}
              aria-label={props.placeholder}
              aria-invalid={Boolean(props.error)}
              disabled={props.disabled}
              onChange={(event) => setPrimaryValue(event.target.value)}
            />
          ) : (
            <Input
              value={primaryValue}
              placeholder={props.placeholder}
              aria-label={props.placeholder}
              aria-invalid={Boolean(props.error)}
              autoComplete="off"
              disabled={props.disabled}
              onChange={(event) => setPrimaryValue(event.target.value)}
            />
          )}
          {props.multiline ? (
            <div className="flex items-center justify-between gap-3 text-caption text-label-secondary">
              <FieldMessage message={props.error} />
              <span>
                {primaryValue.length}/{DESCRIPTION_MAX_LENGTH}
              </span>
            </div>
          ) : (
            <FieldMessage message={props.error} />
          )}
        </Field>

        <div className="flex flex-col gap-3 border-y border-border py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <Languages className="mt-0.5 size-4 shrink-0 text-label-secondary" aria-hidden="true" />
            <div className="min-w-0">
              <div className="text-headline font-medium text-label-primary">
                {props.enabledLabel}
              </div>
              <p className="mt-1 text-footnote text-label-secondary">
                {props.enabled
                  ? t("settings:SETTINGS_I18N_CONFIGURED_COUNT", { count: configuredCount })
                  : props.enabledDescription}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            {props.enabled ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={props.disabled}
                onClick={() => setTranslationsOpen(true)}
              >
                {t("settings:SETTINGS_I18N_MANAGE_ACTION")}
              </Button>
            ) : null}
            <Switch
              aria-label={props.enabledLabel}
              checked={props.enabled}
              disabled={props.disabled}
              onCheckedChange={props.onToggle}
            />
          </div>
        </div>
      </FieldGroup>

      <SettingDialog
        open={props.enabled && translationsOpen}
        onOpenChange={setTranslationsOpen}
        preventInitialFocus={false}
        title={props.enabledLabel}
        description={props.enabledDescription}
        footer={
          <div className="flex w-full justify-end">
            <Button type="button" onClick={() => setTranslationsOpen(false)}>
              {t("common:CLOSE")}
            </Button>
          </div>
        }
      >
        <Controller
          control={props.form.control}
          name={props.dictName}
          render={({ field }) => (
            <Field data-invalid={Boolean(props.error)}>
              <LocalizedStringDictField
                supportedLocales={props.supportedLocales}
                defaultLocale={props.defaultLocale}
                value={field.value ?? {}}
                onChange={field.onChange}
                onDefaultLocaleChange={(locale) =>
                  props.form.setValue("defaultLocale", String(locale), { shouldDirty: true })
                }
                placeholder={props.placeholder}
                multiline={props.multiline}
              />
              <FieldMessage message={props.error} />
            </Field>
          )}
        />
      </SettingDialog>
    </>
  );
}
