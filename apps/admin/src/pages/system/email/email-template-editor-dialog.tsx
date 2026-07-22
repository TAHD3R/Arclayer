import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";

import { Button } from "@arclayer/ui/button";
import { Input } from "@arclayer/ui/input";
import { SettingDialog } from "@arclayer/ui/setting-dialog";
import { SettingDialogField, SettingDialogFields } from "@arclayer/ui/setting-dialog-field";
import { Switch } from "@arclayer/ui/switch";
import { Textarea } from "@arclayer/ui/textarea";

import {
  createMailTemplate,
  previewMailTemplate,
  updateMailTemplate,
  type MailTemplate,
  type MailTemplateInput,
  type MailTemplatePreview,
} from "@/api/mail";
import { notifyError, notifySuccessText } from "@/lib/notifications";

type TemplateFormValues = {
  key: string;
  locale: string;
  name: string;
  description: string;
  subjectTemplate: string;
  htmlTemplate: string;
  textTemplate: string;
  variables: string;
  previewVariables: string;
  isEnabled: boolean;
};

function formValues(template: MailTemplate | null): TemplateFormValues {
  const variables = template?.variables ?? [];
  return {
    key: template?.key ?? "",
    locale: template?.locale ?? "zh-CN",
    name: template?.name ?? "",
    description: template?.description ?? "",
    subjectTemplate: template?.subjectTemplate ?? "",
    htmlTemplate: template?.htmlTemplate ?? "",
    textTemplate: template?.textTemplate ?? "",
    variables: variables.join(", "),
    previewVariables: JSON.stringify(
      Object.fromEntries(variables.map((variable) => [variable, `${variable} sample`])),
      null,
      2,
    ),
    isEnabled: template?.isEnabled ?? true,
  };
}

function variableNames(value: string): string[] {
  return [
    ...new Set(
      value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ];
}

export function EmailTemplateEditorDialog(props: {
  open: boolean;
  template: MailTemplate | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => Promise<void>;
}) {
  const { t } = useTranslation(["settings"]);
  const form = useForm<TemplateFormValues>({ defaultValues: formValues(props.template) });
  const [preview, setPreview] = useState<MailTemplatePreview | null>(null);
  const [previewWidth, setPreviewWidth] = useState<"desktop" | "mobile">("desktop");
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!props.open) return;
    form.reset(formValues(props.template));
    setPreview(null);
  }, [form, props.open, props.template]);

  const renderPreview = async () => {
    const values = form.getValues();
    let variables: Record<string, unknown>;
    try {
      variables = JSON.parse(values.previewVariables || "{}") as Record<string, unknown>;
      form.clearErrors("previewVariables");
    } catch {
      form.setError("previewVariables", {
        type: "validate",
        message: t("settings:SETTINGS_SYSTEM_EMAIL_TEMPLATE_VARIABLES_JSON_INVALID"),
      });
      return;
    }
    setIsPreviewing(true);
    try {
      setPreview(
        await previewMailTemplate({
          subjectTemplate: values.subjectTemplate,
          htmlTemplate: values.htmlTemplate,
          textTemplate: values.textTemplate,
          variables,
        }),
      );
    } catch (error) {
      notifyError(error);
    } finally {
      setIsPreviewing(false);
    }
  };

  const save = form.handleSubmit(async (values) => {
    const input: MailTemplateInput = {
      key: values.key.trim(),
      locale: values.locale.trim(),
      name: values.name.trim(),
      description: values.description.trim() || null,
      subjectTemplate: values.subjectTemplate,
      htmlTemplate: values.htmlTemplate,
      textTemplate: values.textTemplate,
      variables: variableNames(values.variables),
      isEnabled: values.isEnabled,
    };
    setIsSaving(true);
    try {
      if (props.template) {
        await updateMailTemplate(props.template.id, {
          name: input.name,
          description: input.description,
          subjectTemplate: input.subjectTemplate,
          htmlTemplate: input.htmlTemplate,
          textTemplate: input.textTemplate,
          variables: input.variables,
          isEnabled: input.isEnabled,
        });
      } else {
        await createMailTemplate(input);
      }
      await props.onSaved();
      notifySuccessText(t("settings:SETTINGS_SAVED"));
      props.onOpenChange(false);
    } catch (error) {
      notifyError(error);
    } finally {
      setIsSaving(false);
    }
  });

  const values = form.watch();
  return (
    <SettingDialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={
        props.template
          ? t("settings:SETTINGS_SYSTEM_EMAIL_TEMPLATE_EDIT_TITLE")
          : t("settings:SETTINGS_SYSTEM_EMAIL_TEMPLATE_CREATE_TITLE")
      }
      description={t("settings:SETTINGS_SYSTEM_EMAIL_TEMPLATE_EDITOR_DESC")}
      contentClassName="sm:max-w-6xl"
      bodyClassName="p-0"
      footer={
        <>
          <Button type="button" variant="outline" onClick={() => props.onOpenChange(false)}>
            {t("settings:SETTINGS_CANCEL")}
          </Button>
          <Button type="button" loading={isSaving} disabled={isSaving} onClick={() => void save()}>
            {t("settings:SETTINGS_SAVE")}
          </Button>
        </>
      }
    >
      <div className="grid min-h-[34rem] min-w-0 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,0.9fr)]">
        <SettingDialogFields className="min-w-0 border-b p-6 lg:border-r lg:border-b-0">
          <div className="grid gap-4 sm:grid-cols-2">
            <SettingDialogField title={t("settings:SETTINGS_SYSTEM_EMAIL_TEMPLATE_KEY_LABEL")}>
              <Input
                {...form.register("key", { required: true })}
                aria-label={t("settings:SETTINGS_SYSTEM_EMAIL_TEMPLATE_KEY_LABEL")}
                disabled={Boolean(props.template)}
              />
            </SettingDialogField>
            <SettingDialogField title={t("settings:SETTINGS_SYSTEM_EMAIL_TEMPLATE_LOCALE_LABEL")}>
              <Input
                {...form.register("locale", { required: true })}
                aria-label={t("settings:SETTINGS_SYSTEM_EMAIL_TEMPLATE_LOCALE_LABEL")}
                disabled={Boolean(props.template)}
              />
            </SettingDialogField>
          </div>
          <SettingDialogField title={t("settings:SETTINGS_SYSTEM_EMAIL_TEMPLATE_NAME_LABEL")}>
            <Input
              {...form.register("name", { required: true })}
              aria-label={t("settings:SETTINGS_SYSTEM_EMAIL_TEMPLATE_NAME_LABEL")}
            />
          </SettingDialogField>
          <SettingDialogField
            title={t("settings:SETTINGS_SYSTEM_EMAIL_TEMPLATE_DESCRIPTION_LABEL")}
          >
            <Textarea
              {...form.register("description")}
              aria-label={t("settings:SETTINGS_SYSTEM_EMAIL_TEMPLATE_DESCRIPTION_LABEL")}
              className="min-h-20"
            />
          </SettingDialogField>
          <SettingDialogField title={t("settings:SETTINGS_SYSTEM_EMAIL_TEMPLATE_SUBJECT_LABEL")}>
            <Input
              {...form.register("subjectTemplate", { required: true })}
              aria-label={t("settings:SETTINGS_SYSTEM_EMAIL_TEMPLATE_SUBJECT_LABEL")}
            />
          </SettingDialogField>
          <SettingDialogField
            title={t("settings:SETTINGS_SYSTEM_EMAIL_TEMPLATE_VARIABLES_LABEL")}
            description={t("settings:SETTINGS_SYSTEM_EMAIL_TEMPLATE_VARIABLES_DESC")}
          >
            <Input
              {...form.register("variables")}
              aria-label={t("settings:SETTINGS_SYSTEM_EMAIL_TEMPLATE_VARIABLES_LABEL")}
            />
          </SettingDialogField>
          <SettingDialogField title={t("settings:SETTINGS_SYSTEM_EMAIL_TEMPLATE_HTML_LABEL")}>
            <Textarea
              {...form.register("htmlTemplate", { required: true })}
              aria-label={t("settings:SETTINGS_SYSTEM_EMAIL_TEMPLATE_HTML_LABEL")}
              className="min-h-40 font-mono text-caption"
            />
          </SettingDialogField>
          <SettingDialogField title={t("settings:SETTINGS_SYSTEM_EMAIL_TEMPLATE_TEXT_LABEL")}>
            <Textarea
              {...form.register("textTemplate", { required: true })}
              aria-label={t("settings:SETTINGS_SYSTEM_EMAIL_TEMPLATE_TEXT_LABEL")}
              className="min-h-28 font-mono text-caption"
            />
          </SettingDialogField>
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-headline text-label-primary">
                {t("settings:SETTINGS_SYSTEM_EMAIL_TEMPLATE_ENABLED_LABEL")}
              </div>
              <div className="text-footnote text-label-secondary">
                {t("settings:SETTINGS_SYSTEM_EMAIL_TEMPLATE_ENABLED_DESC")}
              </div>
            </div>
            <Switch
              checked={values.isEnabled}
              onCheckedChange={(checked) => form.setValue("isEnabled", checked)}
            />
          </div>
        </SettingDialogFields>

        <div className="flex min-w-0 flex-col bg-muted/35 p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="text-headline text-label-primary">
              {t("settings:SETTINGS_SYSTEM_EMAIL_TEMPLATE_PREVIEW_TITLE")}
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant={previewWidth === "desktop" ? "secondary" : "ghost"}
                onClick={() => setPreviewWidth("desktop")}
              >
                {t("settings:SETTINGS_SYSTEM_EMAIL_TEMPLATE_PREVIEW_DESKTOP")}
              </Button>
              <Button
                type="button"
                size="sm"
                variant={previewWidth === "mobile" ? "secondary" : "ghost"}
                onClick={() => setPreviewWidth("mobile")}
              >
                {t("settings:SETTINGS_SYSTEM_EMAIL_TEMPLATE_PREVIEW_MOBILE")}
              </Button>
            </div>
          </div>
          <SettingDialogField
            title={t("settings:SETTINGS_SYSTEM_EMAIL_TEMPLATE_SAMPLE_DATA_LABEL")}
            error={form.formState.errors.previewVariables?.message}
          >
            <Textarea
              {...form.register("previewVariables")}
              aria-label={t("settings:SETTINGS_SYSTEM_EMAIL_TEMPLATE_SAMPLE_DATA_LABEL")}
              className="min-h-28 font-mono text-caption"
            />
          </SettingDialogField>
          <Button
            type="button"
            variant="outline"
            className="mt-4 self-start"
            loading={isPreviewing}
            onClick={() => void renderPreview()}
          >
            {t("settings:SETTINGS_SYSTEM_EMAIL_TEMPLATE_RENDER_PREVIEW")}
          </Button>
          <div className="mt-5 flex min-h-0 flex-1 justify-center overflow-auto rounded-lg border bg-card p-3">
            {preview ? (
              <div className={previewWidth === "mobile" ? "w-[375px] max-w-full" : "w-full"}>
                <div className="mb-2 truncate text-caption text-label-secondary">
                  {preview.subject}
                </div>
                <iframe
                  title={t("settings:SETTINGS_SYSTEM_EMAIL_TEMPLATE_PREVIEW_FRAME_TITLE")}
                  sandbox=""
                  srcDoc={preview.html}
                  className="h-[28rem] w-full rounded-md bg-white"
                />
              </div>
            ) : (
              <div className="m-auto max-w-sm text-center text-body text-label-secondary">
                {t("settings:SETTINGS_SYSTEM_EMAIL_TEMPLATE_PREVIEW_EMPTY")}
              </div>
            )}
          </div>
        </div>
      </div>
    </SettingDialog>
  );
}
