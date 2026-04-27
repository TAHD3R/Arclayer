import * as React from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@arclayer/ui/button";
import { Input } from "@arclayer/ui/input";
import { SettingDialog } from "@arclayer/ui/setting-dialog";
import { SettingDialogField, SettingDialogFields } from "@arclayer/ui/setting-dialog-field";
import { Textarea } from "@arclayer/ui/textarea";

import type { CreateContentTypeFormValues, CreateContentTypeSubmitValues } from "../types";
import {
  buildCreateContentTypePayload,
  createGeneratedIdentifier,
  createManualIdentifier,
  syncGeneratedIdentifiersWithName,
  validateContentTypeIdentifier,
} from "../utils";

const DEFAULT_VALUES: CreateContentTypeFormValues = {
  name: "",
  singularKey: createGeneratedIdentifier(""),
  pluralKey: createGeneratedIdentifier(""),
  description: "",
};

type CreateContentTypeDialogProps = {
  open: boolean;
  pending?: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: CreateContentTypeSubmitValues) => Promise<void> | void;
};

type FormErrors = Partial<Record<"name" | "singularKey" | "pluralKey", string>>;

export function CreateContentTypeDialog({
  open,
  pending = false,
  onOpenChange,
  onSubmit,
}: CreateContentTypeDialogProps) {
  const { t } = useTranslation("content");
  const [values, setValues] = React.useState<CreateContentTypeFormValues>(DEFAULT_VALUES);
  const [errors, setErrors] = React.useState<FormErrors>({});

  React.useEffect(() => {
    if (open) return;
    setValues(DEFAULT_VALUES);
    setErrors({});
  }, [open]);

  const validate = React.useCallback((): FormErrors => {
    const nextErrors: FormErrors = {};
    const name = values.name.trim();
    const singularKey = values.singularKey.value.trim();
    const pluralKey = values.pluralKey.value.trim();

    if (!name) nextErrors.name = t("CONTENT_MODELS_CREATE_CONTENT_TYPE_VALIDATION_NAME");
    if (!singularKey) {
      nextErrors.singularKey = t("CONTENT_MODELS_CREATE_CONTENT_TYPE_VALIDATION_SINGULAR");
    } else if (!validateContentTypeIdentifier(singularKey)) {
      nextErrors.singularKey = t("CONTENT_MODELS_CREATE_CONTENT_TYPE_VALIDATION_IDENTIFIER_FORMAT");
    }
    if (!pluralKey) {
      nextErrors.pluralKey = t("CONTENT_MODELS_CREATE_CONTENT_TYPE_VALIDATION_PLURAL");
    } else if (!validateContentTypeIdentifier(pluralKey)) {
      nextErrors.pluralKey = t("CONTENT_MODELS_CREATE_CONTENT_TYPE_VALIDATION_IDENTIFIER_FORMAT");
    }
    if (singularKey && pluralKey && singularKey === pluralKey) {
      nextErrors.pluralKey = t("CONTENT_MODELS_CREATE_CONTENT_TYPE_VALIDATION_IDENTIFIER_MATCH");
    }
    return nextErrors;
  }, [t, values]);

  const submit = React.useCallback(async () => {
    const nextErrors = validate();
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    const name = values.name.trim();
    const singularKey = values.singularKey.value.trim();
    const pluralKey = values.pluralKey.value.trim();
    const description = values.description.trim() || null;
    await onSubmit({
      name,
      singularKey,
      pluralKey,
      description,
      payload: buildCreateContentTypePayload({ name, singularKey, pluralKey, description }),
    });
  }, [onSubmit, validate, values]);

  return (
    <SettingDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("CONTENT_MODELS_CREATE_CONTENT_TYPE_TITLE")}
      description={t("CONTENT_MODELS_CREATE_CONTENT_TYPE_DESC")}
      footer={
        <>
          <Button variant="ghost" disabled={pending} onClick={() => onOpenChange(false)}>
            {t("CONTENT_MODELS_CANCEL_ACTION")}
          </Button>
          <Button loading={pending} onClick={() => void submit()}>
            {t("CONTENT_MODELS_CREATE_CONTENT_TYPE_SUBMIT")}
          </Button>
        </>
      }
    >
      <form
        className="py-2"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <SettingDialogFields>
          <SettingDialogField
            title={t("CONTENT_MODELS_CREATE_CONTENT_TYPE_NAME_LABEL")}
            description={t("CONTENT_MODELS_CREATE_CONTENT_TYPE_NAME_HELP")}
            error={
              errors.name ? (
                <div className="text-footnote text-destructive">{errors.name}</div>
              ) : undefined
            }
          >
            <Input
              value={values.name}
              disabled={pending}
              aria-label={t("CONTENT_MODELS_CREATE_CONTENT_TYPE_NAME_LABEL")}
              aria-invalid={errors.name ? true : undefined}
              onChange={(event) => {
                setValues((current) =>
                  syncGeneratedIdentifiersWithName(current, event.target.value),
                );
              }}
            />
          </SettingDialogField>

          <SettingDialogField
            title={t("CONTENT_MODELS_CREATE_CONTENT_TYPE_IDENTIFIER_LABEL")}
            description={t("CONTENT_MODELS_CREATE_CONTENT_TYPE_IDENTIFIER_HELP")}
            error={
              errors.pluralKey || errors.singularKey ? (
                <div className="text-footnote text-destructive">
                  {[errors.pluralKey, errors.singularKey].filter(Boolean).join(" ")}
                </div>
              ) : undefined
            }
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1.5">
                <span className="text-caption text-label-secondary">
                  {t("CONTENT_MODELS_CREATE_CONTENT_TYPE_PLURAL_LABEL")}
                </span>
                <Input
                  value={values.pluralKey.value}
                  disabled={pending}
                  placeholder={t("CONTENT_MODELS_CREATE_CONTENT_TYPE_PLURAL_PLACEHOLDER")}
                  aria-invalid={errors.pluralKey ? true : undefined}
                  onChange={(event) => {
                    setValues((current) => ({
                      ...current,
                      pluralKey: createManualIdentifier(event.target.value),
                    }));
                  }}
                />
              </label>
              <label className="space-y-1.5">
                <span className="text-caption text-label-secondary">
                  {t("CONTENT_MODELS_CREATE_CONTENT_TYPE_SINGULAR_LABEL")}
                </span>
                <Input
                  value={values.singularKey.value}
                  disabled={pending}
                  placeholder={t("CONTENT_MODELS_CREATE_CONTENT_TYPE_SINGULAR_PLACEHOLDER")}
                  aria-invalid={errors.singularKey ? true : undefined}
                  onChange={(event) => {
                    setValues((current) => ({
                      ...current,
                      singularKey: createManualIdentifier(event.target.value),
                    }));
                  }}
                />
              </label>
            </div>
          </SettingDialogField>

          <SettingDialogField
            title={t("CONTENT_MODELS_CREATE_CONTENT_TYPE_DESCRIPTION_LABEL")}
            description={t("CONTENT_MODELS_CREATE_CONTENT_TYPE_DESCRIPTION_HELP")}
          >
            <Textarea
              value={values.description}
              disabled={pending}
              placeholder={t("CONTENT_MODELS_CREATE_CONTENT_TYPE_DESCRIPTION_PLACEHOLDER")}
              onChange={(event) =>
                setValues((current) => ({ ...current, description: event.target.value }))
              }
            />
          </SettingDialogField>
        </SettingDialogFields>
      </form>
    </SettingDialog>
  );
}
