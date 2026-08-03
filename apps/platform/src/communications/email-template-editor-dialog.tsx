import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import type {
  JsonValueInput,
  MailTemplateOut,
  MailTemplatePreviewOut,
} from "@arclayer/platform-openapi";

import {
  createTemplate,
  previewTemplate,
  updateTemplate,
} from "@/communications/communications-api";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { SettingDialog } from "@/components/setting-dialog";
import { SettingDialogField, SettingDialogFields } from "@/components/setting-dialog-field";
import { Textarea } from "@/components/ui/textarea";

type Props = Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCompleted: (messageKey: string) => void;
  template?: MailTemplateOut;
}>;

export function parseTemplateVariableNames(value: string): string[] {
  return [
    ...new Set(
      value
        .split(/[\s,]+/)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ];
}

export function parseTemplateVariableValues(value: string): Record<string, JsonValueInput> {
  if (!value.trim()) return {};
  const parsed: unknown = JSON.parse(value);
  if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
    throw new Error("TEMPLATE_VARIABLE_VALUE_INVALID");
  }
  return parsed as Record<string, JsonValueInput>;
}

function templateValues(template?: MailTemplateOut) {
  return {
    description: template?.description ?? "",
    htmlTemplate: template?.htmlTemplate ?? "",
    isEnabled: template?.isEnabled ?? true,
    key: template?.key ?? "",
    locale: template?.locale ?? "",
    name: template?.name ?? "",
    subjectTemplate: template?.subjectTemplate ?? "",
    textTemplate: template?.textTemplate ?? "",
    variables: template?.variables.join("\n") ?? "",
    sampleValues: JSON.stringify(
      Object.fromEntries((template?.variables ?? []).map((item) => [item, ""])),
      null,
      2,
    ),
  };
}

export function EmailTemplateEditorDialog(props: Props) {
  const { t } = useTranslation("communications");
  const [values, setValues] = useState(() => templateValues(props.template));
  const [pending, setPending] = useState<"preview" | "save" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<MailTemplatePreviewOut | null>(null);

  useEffect(() => {
    if (!props.open) return;
    setValues(templateValues(props.template));
    setPending(null);
    setError(null);
    setPreview(null);
  }, [props.open, props.template]);

  const mutationBody = () => ({
    description: values.description.trim() || null,
    htmlTemplate: values.htmlTemplate,
    isEnabled: values.isEnabled,
    name: values.name.trim(),
    subjectTemplate: values.subjectTemplate,
    textTemplate: values.textTemplate,
    variables: parseTemplateVariableNames(values.variables),
  });

  const renderPreview = async () => {
    let variables;
    try {
      variables = parseTemplateVariableValues(values.sampleValues);
    } catch {
      setError("SAMPLE_VARIABLES_INVALID");
      return;
    }
    setPending("preview");
    setError(null);
    try {
      setPreview(
        await previewTemplate({
          htmlTemplate: values.htmlTemplate,
          subjectTemplate: values.subjectTemplate,
          textTemplate: values.textTemplate,
          variables,
        }),
      );
    } catch {
      setError("OPERATION_FAILED");
    } finally {
      setPending(null);
    }
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending("save");
    setError(null);
    try {
      if (props.template) {
        await updateTemplate(props.template.id, {
          ...mutationBody(),
          expectedVersion: props.template.version,
        });
      } else {
        await createTemplate({
          ...mutationBody(),
          key: values.key.trim(),
          locale: values.locale.trim(),
        });
      }
      props.onCompleted("OPERATION_ACCEPTED");
      props.onOpenChange(false);
    } catch {
      setError("OPERATION_FAILED");
    } finally {
      setPending(null);
    }
  };

  const updateValue = <K extends keyof typeof values>(key: K, value: (typeof values)[K]) => {
    setValues((current) => ({ ...current, [key]: value }));
  };

  return (
    <SettingDialog
      contentClassName="sm:max-w-4xl"
      open={props.open}
      onOpenChange={(open) => !pending && props.onOpenChange(open)}
      title={t(props.template ? "EDIT_TEMPLATE" : "CREATE_TEMPLATE")}
      description={t(props.template ? "EDIT_TEMPLATE_DESCRIPTION" : "CREATE_TEMPLATE_DESCRIPTION")}
      footer={
        <>
          <Button
            disabled={Boolean(pending)}
            onClick={() => props.onOpenChange(false)}
            variant="outline"
          >
            {t("CANCEL")}
          </Button>
          <Button
            disabled={
              Boolean(pending) ||
              !values.subjectTemplate ||
              !values.htmlTemplate ||
              !values.textTemplate
            }
            loading={pending === "preview"}
            onClick={() => void renderPreview()}
            type="button"
            variant="outline"
          >
            {t("PREVIEW_TEMPLATE")}
          </Button>
          <Button
            disabled={Boolean(pending)}
            form="email-template-editor"
            loading={pending === "save"}
            type="submit"
          >
            {t("SAVE_TEMPLATE")}
          </Button>
        </>
      }
    >
      <form id="email-template-editor" onSubmit={submit}>
        <SettingDialogFields>
          {error ? (
            <Alert variant="destructive">
              <AlertTitle>{t("OPERATION_FAILED")}</AlertTitle>
              <AlertDescription>{t(error)}</AlertDescription>
            </Alert>
          ) : null}
          <div className="grid gap-5 md:grid-cols-2">
            <SettingDialogField
              title={<label htmlFor="template-key">{t("TEMPLATE_KEY")}</label>}
              description={t("TEMPLATE_KEY_DESCRIPTION")}
            >
              <Input
                disabled={Boolean(props.template)}
                id="template-key"
                onChange={(event) => updateValue("key", event.target.value)}
                pattern="[a-z][a-z0-9_]{1,95}"
                required={!props.template}
                value={values.key}
              />
            </SettingDialogField>
            <SettingDialogField title={<label htmlFor="template-locale">{t("LOCALE")}</label>}>
              <Input
                disabled={Boolean(props.template)}
                id="template-locale"
                onChange={(event) => updateValue("locale", event.target.value)}
                pattern="[a-z]{2}(-[A-Z]{2})?"
                required={!props.template}
                value={values.locale}
              />
            </SettingDialogField>
          </div>
          <SettingDialogField title={<label htmlFor="template-name">{t("NAME")}</label>}>
            <Input
              id="template-name"
              maxLength={160}
              onChange={(event) => updateValue("name", event.target.value)}
              required
              value={values.name}
            />
          </SettingDialogField>
          <SettingDialogField
            title={<label htmlFor="template-description">{t("DESCRIPTION")}</label>}
          >
            <Textarea
              id="template-description"
              maxLength={500}
              onChange={(event) => updateValue("description", event.target.value)}
              value={values.description}
            />
          </SettingDialogField>
          <SettingDialogField
            title={<label htmlFor="template-subject">{t("SUBJECT_TEMPLATE")}</label>}
          >
            <Textarea
              id="template-subject"
              maxLength={500}
              onChange={(event) => updateValue("subjectTemplate", event.target.value)}
              required
              value={values.subjectTemplate}
            />
          </SettingDialogField>
          <SettingDialogField title={<label htmlFor="template-html">{t("HTML_TEMPLATE")}</label>}>
            <Textarea
              className="min-h-40 font-mono"
              id="template-html"
              onChange={(event) => updateValue("htmlTemplate", event.target.value)}
              required
              value={values.htmlTemplate}
            />
          </SettingDialogField>
          <SettingDialogField title={<label htmlFor="template-text">{t("TEXT_TEMPLATE")}</label>}>
            <Textarea
              className="min-h-32 font-mono"
              id="template-text"
              onChange={(event) => updateValue("textTemplate", event.target.value)}
              required
              value={values.textTemplate}
            />
          </SettingDialogField>
          <SettingDialogField
            title={<label htmlFor="template-variables">{t("VARIABLES")}</label>}
            description={t("VARIABLES_DESCRIPTION")}
          >
            <Textarea
              className="font-mono"
              id="template-variables"
              onChange={(event) => updateValue("variables", event.target.value)}
              value={values.variables}
            />
          </SettingDialogField>
          <SettingDialogField
            title={<label htmlFor="template-sample-values">{t("SAMPLE_VARIABLES")}</label>}
            description={t("SAMPLE_VARIABLES_DESCRIPTION")}
          >
            <Textarea
              className="font-mono"
              id="template-sample-values"
              onChange={(event) => updateValue("sampleValues", event.target.value)}
              value={values.sampleValues}
            />
          </SettingDialogField>
          <label className="flex items-center gap-3 text-sm">
            <Checkbox
              checked={values.isEnabled}
              onCheckedChange={(checked) => updateValue("isEnabled", checked === true)}
            />
            {t("TEMPLATE_ENABLED")}
          </label>
          {preview ? <TemplatePreview preview={preview} /> : null}
        </SettingDialogFields>
      </form>
    </SettingDialog>
  );
}

function TemplatePreview({ preview }: Readonly<{ preview: MailTemplatePreviewOut }>) {
  const { t } = useTranslation("communications");
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>{t("PREVIEW_SUBJECT")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="font-medium">{preview.subject}</p>
          <div>
            <p className="mb-2 text-sm text-muted-foreground">{t("PREVIEW_TEXT")}</p>
            <pre className="whitespace-pre-wrap rounded-md border bg-muted p-3 text-sm">
              {preview.text}
            </pre>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t("PREVIEW_HTML")}</CardTitle>
        </CardHeader>
        <CardContent>
          <iframe
            className="h-72 w-full rounded-md border bg-white"
            sandbox=""
            srcDoc={preview.html}
            title={t("PREVIEW_HTML")}
          />
        </CardContent>
      </Card>
    </div>
  );
}
