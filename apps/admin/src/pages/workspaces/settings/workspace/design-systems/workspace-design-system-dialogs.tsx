import { useEffect, useState } from "react";
import { CircleAlert } from "lucide-react";
import { useTranslation } from "react-i18next";

import type {
  DesignSystemCreateRequest,
  DesignSystemManifestV1,
  DesignSystemVersionCreateRequest,
  ComponentCatalogV1,
} from "@arclayer/openapi";
import { Alert, AlertDescription } from "@arclayer/ui/alert";
import { Button } from "@arclayer/ui/button";
import { Input } from "@arclayer/ui/input";
import { SettingDialog } from "@arclayer/ui/setting-dialog";
import { SettingDialogField, SettingDialogFields } from "@arclayer/ui/setting-dialog-field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@arclayer/ui/select";
import { Textarea } from "@arclayer/ui/textarea";

import {
  buildDesignSystemFoundationManifest,
  designSystemFoundationDefaults,
  validateDesignSystemFoundationValues,
  type DesignSystemFoundationValues,
} from "./workspace-design-system-manifest";

type DialogStateProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pending: boolean;
  error: unknown;
};

const COLOR_LABEL_KEYS = {
  canvasColor: "SETTINGS_WORKSPACE_DESIGN_SYSTEMS_CANVAS_COLOR_LABEL",
  primaryTextColor: "SETTINGS_WORKSPACE_DESIGN_SYSTEMS_PRIMARY_TEXT_COLOR_LABEL",
  secondaryTextColor: "SETTINGS_WORKSPACE_DESIGN_SYSTEMS_SECONDARY_TEXT_COLOR_LABEL",
  actionColor: "SETTINGS_WORKSPACE_DESIGN_SYSTEMS_ACTION_COLOR_LABEL",
  actionTextColor: "SETTINGS_WORKSPACE_DESIGN_SYSTEMS_ACTION_TEXT_COLOR_LABEL",
  borderColor: "SETTINGS_WORKSPACE_DESIGN_SYSTEMS_BORDER_COLOR_LABEL",
  focusColor: "SETTINGS_WORKSPACE_DESIGN_SYSTEMS_FOCUS_COLOR_LABEL",
} as const;

export function WorkspaceDesignSystemCreateDialog(
  props: DialogStateProps & {
    onSubmit: (payload: DesignSystemCreateRequest, idempotencyKey: string) => void;
  },
) {
  const { t } = useTranslation(["settings", "common"]);
  const formId = "workspace-design-system-create-form";
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [key, setKey] = useState(() => crypto.randomUUID());
  useEffect(() => {
    if (!props.open) return;
    setName("");
    setDescription("");
    setKey(crypto.randomUUID());
  }, [props.open]);

  return (
    <SettingDialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={t("settings:SETTINGS_WORKSPACE_DESIGN_SYSTEMS_CREATE_TITLE")}
      description={t("settings:SETTINGS_WORKSPACE_DESIGN_SYSTEMS_CREATE_DESC")}
      preventInitialFocus={false}
      footer={
        <>
          <Button
            variant="ghost"
            disabled={props.pending}
            onClick={() => props.onOpenChange(false)}
          >
            {t("common:CANCEL")}
          </Button>
          <Button type="submit" form={formId} loading={props.pending}>
            {t("settings:SETTINGS_WORKSPACE_DESIGN_SYSTEMS_CREATE_ACTION")}
          </Button>
        </>
      }
    >
      <form
        id={formId}
        onSubmit={(event) => {
          event.preventDefault();
          if (!name.trim()) return;
          props.onSubmit({ name: name.trim(), description: description.trim() || null }, key);
        }}
      >
        <SettingDialogFields>
          {props.error ? <DialogError /> : null}
          <SettingDialogField
            title={
              <label htmlFor={`${formId}-name`}>
                {t("settings:SETTINGS_WORKSPACE_DESIGN_SYSTEMS_NAME_LABEL")}
              </label>
            }
          >
            <Input
              id={`${formId}-name`}
              autoFocus
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </SettingDialogField>
          <SettingDialogField
            title={
              <label htmlFor={`${formId}-description`}>
                {t("settings:SETTINGS_WORKSPACE_DESIGN_SYSTEMS_DESCRIPTION_LABEL")}
              </label>
            }
          >
            <Textarea
              id={`${formId}-description`}
              className="min-h-24"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </SettingDialogField>
        </SettingDialogFields>
      </form>
    </SettingDialog>
  );
}

export function WorkspaceDesignSystemVersionDialog(
  props: DialogStateProps & {
    source?: DesignSystemManifestV1;
    parentVersionId?: string;
    parentChecksum?: string;
    componentCatalogs: ComponentCatalogV1[];
    componentCatalogsPending: boolean;
    componentCatalogsError: unknown;
    onSubmit: (payload: DesignSystemVersionCreateRequest, idempotencyKey: string) => void;
  },
) {
  const { t } = useTranslation(["settings", "common"]);
  const formId = "workspace-design-system-version-form";
  const defaultCatalogVersion = props.componentCatalogs[0]?.catalogVersion ?? "";
  const [values, setValues] = useState(() =>
    designSystemFoundationDefaults(props.source, defaultCatalogVersion),
  );
  const [errors, setErrors] = useState(() => validateDesignSystemFoundationValues(values));
  const [key, setKey] = useState(() => crypto.randomUUID());

  useEffect(() => {
    if (!props.open) return;
    const next = designSystemFoundationDefaults(props.source, defaultCatalogVersion);
    setValues(next);
    setErrors({});
    setKey(crypto.randomUUID());
  }, [defaultCatalogVersion, props.open, props.source]);

  const update = (field: keyof DesignSystemFoundationValues, value: string) => {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  };
  const submit = () => {
    const nextErrors = validateDesignSystemFoundationValues(values);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    props.onSubmit(
      {
        manifest: buildDesignSystemFoundationManifest(values, props.source),
        parentVersionId: props.parentVersionId ?? null,
        expectedParentChecksum: props.parentChecksum ?? null,
        source: "manual",
      },
      key,
    );
  };

  return (
    <SettingDialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={t("settings:SETTINGS_WORKSPACE_DESIGN_SYSTEMS_VERSION_CREATE_TITLE")}
      description={t("settings:SETTINGS_WORKSPACE_DESIGN_SYSTEMS_VERSION_CREATE_DESC")}
      contentClassName="sm:max-w-3xl"
      preventInitialFocus={false}
      footer={
        <>
          <Button
            variant="ghost"
            disabled={props.pending}
            onClick={() => props.onOpenChange(false)}
          >
            {t("common:CANCEL")}
          </Button>
          <Button
            type="submit"
            form={formId}
            loading={props.pending}
            disabled={
              props.pending ||
              props.componentCatalogsPending ||
              props.componentCatalogs.length === 0
            }
          >
            {t("settings:SETTINGS_WORKSPACE_DESIGN_SYSTEMS_VERSION_CREATE_ACTION")}
          </Button>
        </>
      }
    >
      <form
        id={formId}
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <SettingDialogFields>
          {props.error ? <DialogError /> : null}
          {props.componentCatalogsError ? <DialogError /> : null}
          <SettingDialogField
            title={
              <label htmlFor={`${formId}-name`}>
                {t("settings:SETTINGS_WORKSPACE_DESIGN_SYSTEMS_MANIFEST_NAME_LABEL")}
              </label>
            }
            error={
              errors.manifestName
                ? t("settings:SETTINGS_WORKSPACE_DESIGN_SYSTEMS_FIELD_REQUIRED")
                : undefined
            }
          >
            <Input
              id={`${formId}-name`}
              autoFocus
              aria-invalid={Boolean(errors.manifestName)}
              value={values.manifestName}
              onChange={(event) => update("manifestName", event.target.value)}
            />
          </SettingDialogField>

          <SettingDialogField
            title={
              <label htmlFor={`${formId}-component-catalog`}>
                {t("settings:SETTINGS_WORKSPACE_DESIGN_SYSTEMS_COMPONENT_CATALOG_LABEL")}
              </label>
            }
            description={t("settings:SETTINGS_WORKSPACE_DESIGN_SYSTEMS_COMPONENT_CATALOG_DESC")}
            error={
              errors.componentCatalogVersion
                ? t("settings:SETTINGS_WORKSPACE_DESIGN_SYSTEMS_FIELD_REQUIRED")
                : undefined
            }
          >
            <Select
              value={values.componentCatalogVersion}
              disabled={props.componentCatalogsPending || props.componentCatalogs.length === 0}
              onValueChange={(value) => update("componentCatalogVersion", value)}
            >
              <SelectTrigger id={`${formId}-component-catalog`} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {props.componentCatalogs.map((catalog) => (
                  <SelectItem key={catalog.catalogVersion} value={catalog.catalogVersion}>
                    {localizedCatalogName(catalog)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </SettingDialogField>

          <section className="flex flex-col gap-3" aria-labelledby={`${formId}-colors-title`}>
            <div>
              <h3 id={`${formId}-colors-title`} className="text-headline text-label-primary">
                {t("settings:SETTINGS_WORKSPACE_DESIGN_SYSTEMS_COLOR_SECTION")}
              </h3>
              <p className="mt-1 text-footnote text-label-secondary">
                {t("settings:SETTINGS_WORKSPACE_DESIGN_SYSTEMS_COLOR_SECTION_DESC")}
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {(
                [
                  "canvasColor",
                  "primaryTextColor",
                  "secondaryTextColor",
                  "actionColor",
                  "actionTextColor",
                  "borderColor",
                  "focusColor",
                ] as const
              ).map((field) => (
                <ColorField
                  key={field}
                  id={`${formId}-${field}`}
                  label={t(`settings:${COLOR_LABEL_KEYS[field]}`)}
                  value={values[field]}
                  invalid={Boolean(errors[field])}
                  onChange={(value) => update(field, value)}
                />
              ))}
            </div>
          </section>

          <div className="grid gap-5 sm:grid-cols-3">
            <TextField
              id={`${formId}-font`}
              label={t("settings:SETTINGS_WORKSPACE_DESIGN_SYSTEMS_BODY_FONT_LABEL")}
              value={values.bodyFont}
              invalid={Boolean(errors.bodyFont)}
              onChange={(value) => update("bodyFont", value)}
            />
            <TextField
              id={`${formId}-size`}
              label={t("settings:SETTINGS_WORKSPACE_DESIGN_SYSTEMS_BASE_FONT_SIZE_LABEL")}
              value={values.baseFontSize}
              invalid={Boolean(errors.baseFontSize)}
              onChange={(value) => update("baseFontSize", value)}
            />
            <TextField
              id={`${formId}-motion`}
              label={t("settings:SETTINGS_WORKSPACE_DESIGN_SYSTEMS_MOTION_DURATION_LABEL")}
              value={values.motionDuration}
              invalid={Boolean(errors.motionDuration)}
              onChange={(value) => update("motionDuration", value)}
            />
          </div>
        </SettingDialogFields>
      </form>
    </SettingDialog>
  );
}

function localizedCatalogName(catalog: ComponentCatalogV1): string {
  const locale = document.documentElement.lang === "zh-CN" ? "zh-CN" : "en-US";
  return catalog.nameByLocale[locale] ?? catalog.nameByLocale["en-US"] ?? catalog.catalogVersion;
}

function ColorField(props: {
  id: string;
  label: string;
  value: string;
  invalid: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <SettingDialogField
      title={
        <label id={`${props.id}-label`} htmlFor={props.id}>
          {props.label}
        </label>
      }
    >
      <div className="flex items-center gap-2">
        <Input
          type="color"
          aria-labelledby={`${props.id}-label`}
          className="size-11 shrink-0 p-1"
          value={/^#[0-9A-Fa-f]{6}$/.test(props.value) ? props.value : "#000000"}
          onChange={(event) => props.onChange(event.target.value.toUpperCase())}
        />
        <Input
          id={props.id}
          className="font-mono"
          aria-invalid={props.invalid}
          value={props.value}
          onChange={(event) => props.onChange(event.target.value)}
        />
      </div>
    </SettingDialogField>
  );
}

function TextField(props: {
  id: string;
  label: string;
  value: string;
  invalid: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <SettingDialogField title={<label htmlFor={props.id}>{props.label}</label>}>
      <Input
        id={props.id}
        aria-invalid={props.invalid}
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
      />
    </SettingDialogField>
  );
}

function DialogError() {
  const { t } = useTranslation("settings");
  return (
    <Alert variant="destructive">
      <CircleAlert aria-hidden="true" />
      <AlertDescription>{t("SETTINGS_WORKSPACE_DESIGN_SYSTEMS_COMMAND_ERROR")}</AlertDescription>
    </Alert>
  );
}
