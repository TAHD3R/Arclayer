import * as React from "react";
import { useTranslation } from "react-i18next";
import { CircleHelp } from "lucide-react";

import { Button } from "@arclayer/ui/button";
import { FieldLabel } from "@arclayer/ui/field";
import { Input } from "@arclayer/ui/input";
import { RadioGroup, RadioGroupItem } from "@arclayer/ui/radio-group";
import { SettingDialog } from "@arclayer/ui/setting-dialog";
import { SettingDialogField, SettingDialogFields } from "@arclayer/ui/setting-dialog-field";
import { Textarea } from "@arclayer/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@arclayer/ui/tooltip";

import type { CreateContentTypeFormValues, CreateContentTypeSubmitValues } from "../types";
import {
  buildCreateContentTypePayload,
  CONTENT_MODEL_DESCRIPTION_MAX_LENGTH,
  CONTENT_MODEL_IDENTIFIER_MAX_LENGTH,
  CONTENT_MODEL_NAME_MAX_LENGTH,
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
  modelKind: "collection_type",
};

type CreateContentTypeDialogProps = {
  open: boolean;
  pending?: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: CreateContentTypeSubmitValues) => Promise<void> | void;
};

type FormErrors = Partial<Record<"name" | "singularKey" | "pluralKey", string>>;

function CharacterCount(props: { value: string; max: number }) {
  return (
    <div className="mt-1 text-right text-caption text-label-secondary">
      {props.value.length}/{props.max}
    </div>
  );
}

function FieldTitleWithHelp({ title, help }: { title: React.ReactNode; help: string }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <span>{title}</span>
      <Tooltip>
        <TooltipTrigger asChild focusTrigger={false}>
          <button
            type="button"
            className="inline-flex size-5 items-center justify-center rounded-full text-label-secondary transition-colors hover:text-label-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20"
            aria-label={help}
          >
            <CircleHelp className="size-4" aria-hidden="true" />
          </button>
        </TooltipTrigger>
        <TooltipContent className="max-w-64 text-left">{help}</TooltipContent>
      </Tooltip>
    </span>
  );
}

function ModelKindOption(props: {
  modelKind: CreateContentTypeFormValues["modelKind"];
  value: CreateContentTypeFormValues["modelKind"];
  disabled?: boolean;
  title: string;
  description: string;
}) {
  const inputId = React.useId();
  return (
    <FieldLabel
      htmlFor={inputId}
      className={[
        "flex h-full min-w-0 cursor-pointer rounded-md border border-border/70 bg-surface p-3 transition-colors",
        "hover:border-border hover:bg-accent/35",
        "has-data-[state=checked]:border-primary/45 has-data-[state=checked]:bg-primary/10",
        "has-[button[disabled]]:cursor-not-allowed has-[button[disabled]]:opacity-60",
      ].join(" ")}
    >
      <div className="flex min-w-0 gap-2">
        <RadioGroupItem
          id={inputId}
          value={props.modelKind}
          disabled={props.disabled}
          className="mt-0.5"
        />
        <div className="min-w-0">
          <div className="text-callout font-semibold text-label-primary">{props.title}</div>
          <div className="mt-1 text-caption text-label-secondary">{props.description}</div>
        </div>
      </div>
    </FieldLabel>
  );
}

export function CreateContentTypeDialog({
  open,
  pending = false,
  onOpenChange,
  onSubmit,
}: CreateContentTypeDialogProps) {
  const { t } = useTranslation("content");
  const [values, setValues] = React.useState<CreateContentTypeFormValues>(DEFAULT_VALUES);
  const [errors, setErrors] = React.useState<FormErrors>({});
  const singularInputId = React.useId();
  const pluralInputId = React.useId();

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
      payload: buildCreateContentTypePayload({
        name,
        singularKey,
        pluralKey,
        description,
        modelKind: values.modelKind,
      }),
    });
  }, [onSubmit, validate, values]);

  return (
    <SettingDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("CONTENT_MODELS_CREATE_CONTENT_TYPE_TITLE")}
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
            title={t("CONTENT_MODELS_CREATE_CONTENT_TYPE_KIND_LABEL")}
            description={t("CONTENT_MODELS_CREATE_CONTENT_TYPE_KIND_HELP")}
          >
            <RadioGroup
              value={values.modelKind}
              disabled={pending}
              onValueChange={(value) => {
                setValues((current) => ({
                  ...current,
                  modelKind: value as CreateContentTypeFormValues["modelKind"],
                }));
              }}
              className="grid gap-2 md:grid-cols-3"
            >
              {(["collection_type", "single_type", "component"] as const).map((modelKind) => (
                <ModelKindOption
                  key={modelKind}
                  modelKind={modelKind}
                  value={values.modelKind}
                  disabled={pending}
                  title={t(`CONTENT_MODELS_KIND_${modelKind.toUpperCase()}`)}
                  description={t(`CONTENT_MODELS_KIND_${modelKind.toUpperCase()}_DESC`)}
                />
              ))}
            </RadioGroup>
          </SettingDialogField>

          <SettingDialogField
            title={t("CONTENT_MODELS_CREATE_CONTENT_TYPE_NAME_LABEL")}
            description={t("CONTENT_MODELS_CREATE_CONTENT_TYPE_NAME_HELP")}
            error={
              errors.name ? (
                <div className="text-footnote text-destructive">{errors.name}</div>
              ) : undefined
            }
          >
            <div>
              <Input
                value={values.name}
                disabled={pending}
                maxLength={CONTENT_MODEL_NAME_MAX_LENGTH}
                placeholder={t("CONTENT_MODELS_CREATE_CONTENT_TYPE_NAME_PLACEHOLDER")}
                aria-label={t("CONTENT_MODELS_CREATE_CONTENT_TYPE_NAME_LABEL")}
                aria-invalid={errors.name ? true : undefined}
                onChange={(event) => {
                  setValues((current) =>
                    syncGeneratedIdentifiersWithName(current, event.target.value),
                  );
                }}
              />
              <CharacterCount value={values.name} max={CONTENT_MODEL_NAME_MAX_LENGTH} />
            </div>
          </SettingDialogField>

          <SettingDialogField
            title={t("CONTENT_MODELS_CREATE_CONTENT_TYPE_IDENTIFIER_LABEL")}
            description={t("CONTENT_MODELS_CREATE_CONTENT_TYPE_IDENTIFIER_HELP")}
            error={
              errors.pluralKey || errors.singularKey ? (
                <div className="text-footnote text-destructive">
                  {[errors.singularKey, errors.pluralKey].filter(Boolean).join(" ")}
                </div>
              ) : undefined
            }
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid space-y-1.5 gap-1">
                <label htmlFor={singularInputId} className="grid space-y-1.5 gap-1">
                  <span className="font-semibold text-label-secondary">
                    <FieldTitleWithHelp
                      title={t("CONTENT_MODELS_CREATE_CONTENT_TYPE_SINGULAR_LABEL")}
                      help={t("CONTENT_MODELS_CREATE_CONTENT_TYPE_SINGULAR_HELP")}
                    />
                  </span>
                </label>
                <div>
                  <Input
                    id={singularInputId}
                    value={values.singularKey.value}
                    disabled={pending}
                    maxLength={CONTENT_MODEL_IDENTIFIER_MAX_LENGTH}
                    placeholder={t("CONTENT_MODELS_CREATE_CONTENT_TYPE_SINGULAR_PLACEHOLDER")}
                    aria-invalid={errors.singularKey ? true : undefined}
                    onChange={(event) => {
                      setValues((current) => ({
                        ...current,
                        singularKey: createManualIdentifier(event.target.value),
                      }));
                    }}
                  />
                  <CharacterCount
                    value={values.singularKey.value}
                    max={CONTENT_MODEL_IDENTIFIER_MAX_LENGTH}
                  />
                </div>
              </div>
              <div className="grid space-y-1.5 gap-1">
                <label htmlFor={pluralInputId} className="grid space-y-1.5 gap-1">
                  <span className="font-semibold text-label-secondary">
                    <FieldTitleWithHelp
                      title={t("CONTENT_MODELS_CREATE_CONTENT_TYPE_PLURAL_LABEL")}
                      help={t("CONTENT_MODELS_CREATE_CONTENT_TYPE_PLURAL_HELP")}
                    />
                  </span>
                </label>
                <div>
                  <Input
                    id={pluralInputId}
                    value={values.pluralKey.value}
                    disabled={pending}
                    maxLength={CONTENT_MODEL_IDENTIFIER_MAX_LENGTH}
                    placeholder={t("CONTENT_MODELS_CREATE_CONTENT_TYPE_PLURAL_PLACEHOLDER")}
                    aria-invalid={errors.pluralKey ? true : undefined}
                    onChange={(event) => {
                      setValues((current) => ({
                        ...current,
                        pluralKey: createManualIdentifier(event.target.value),
                      }));
                    }}
                  />
                  <CharacterCount
                    value={values.pluralKey.value}
                    max={CONTENT_MODEL_IDENTIFIER_MAX_LENGTH}
                  />
                </div>
              </div>
            </div>
          </SettingDialogField>

          <SettingDialogField title={t("CONTENT_MODELS_CREATE_CONTENT_TYPE_DESCRIPTION_LABEL")}>
            <div>
              <Textarea
                aria-label={t("CONTENT_MODELS_CREATE_CONTENT_TYPE_DESCRIPTION_LABEL")}
                value={values.description}
                disabled={pending}
                maxLength={CONTENT_MODEL_DESCRIPTION_MAX_LENGTH}
                placeholder={t("CONTENT_MODELS_CREATE_CONTENT_TYPE_DESCRIPTION_PLACEHOLDER")}
                rows={4}
                onChange={(event) =>
                  setValues((current) => ({ ...current, description: event.target.value }))
                }
              />
              <CharacterCount
                value={values.description}
                max={CONTENT_MODEL_DESCRIPTION_MAX_LENGTH}
              />
            </div>
          </SettingDialogField>
        </SettingDialogFields>
      </form>
    </SettingDialog>
  );
}
