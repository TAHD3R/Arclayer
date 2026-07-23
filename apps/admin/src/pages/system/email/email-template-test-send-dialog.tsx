import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@arclayer/ui/button";
import { Input } from "@arclayer/ui/input";
import { SettingDialog } from "@arclayer/ui/setting-dialog";
import { SettingDialogField, SettingDialogFields } from "@arclayer/ui/setting-dialog-field";
import { Textarea } from "@arclayer/ui/textarea";

import {
  testSendMailTemplate,
  type MailTemplate,
  type MailTemplateTestSendInput,
} from "@/api/mail";
import { notifyError, notifySuccessText } from "@/lib/notifications";

const FORM_ID = "email-template-test-send-form";

function sampleVariables(template: MailTemplate | null): string {
  return JSON.stringify(
    Object.fromEntries((template?.variables ?? []).map((name) => [name, `${name} sample`])),
    null,
    2,
  );
}

function parseVariables(value: string): NonNullable<MailTemplateTestSendInput["variables"]> {
  const parsed: unknown = JSON.parse(value || "{}");
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new TypeError("MAIL_TEMPLATE_VARIABLES_OBJECT_REQUIRED");
  }
  return parsed as NonNullable<MailTemplateTestSendInput["variables"]>;
}

export function EmailTemplateTestSendDialog(props: {
  open: boolean;
  template: MailTemplate | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation(["settings"]);
  const [recipient, setRecipient] = useState("");
  const [variables, setVariables] = useState("{}");
  const [variablesError, setVariablesError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);

  useEffect(() => {
    if (!props.open) return;
    setRecipient("");
    setVariables(sampleVariables(props.template));
    setVariablesError(null);
  }, [props.open, props.template]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!props.template) return;
    let parsedVariables: NonNullable<MailTemplateTestSendInput["variables"]>;
    try {
      parsedVariables = parseVariables(variables);
      setVariablesError(null);
    } catch {
      setVariablesError(t("settings:SETTINGS_SYSTEM_EMAIL_TEMPLATE_VARIABLES_JSON_INVALID"));
      return;
    }
    setIsSending(true);
    try {
      await testSendMailTemplate(props.template.id, {
        recipient: recipient.trim(),
        variables: parsedVariables,
      });
      notifySuccessText(t("settings:SETTINGS_SYSTEM_EMAIL_TEMPLATE_TEST_SEND_ACCEPTED"));
      props.onOpenChange(false);
    } catch (error) {
      notifyError(error);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <SettingDialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={t("settings:SETTINGS_SYSTEM_EMAIL_TEMPLATE_TEST_SEND_TITLE")}
      description={t("settings:SETTINGS_SYSTEM_EMAIL_TEMPLATE_TEST_SEND_DESC", {
        name: props.template?.name ?? "",
        locale: props.template?.locale ?? "",
        version: props.template?.version ?? "",
      })}
      contentClassName="sm:max-w-2xl"
      footer={
        <>
          <Button
            type="button"
            variant="outline"
            disabled={isSending}
            onClick={() => props.onOpenChange(false)}
          >
            {t("settings:SETTINGS_CANCEL")}
          </Button>
          <Button type="submit" form={FORM_ID} loading={isSending}>
            {t("settings:SETTINGS_SYSTEM_EMAIL_TEMPLATE_TEST_SEND_CONFIRM")}
          </Button>
        </>
      }
    >
      <form id={FORM_ID} onSubmit={submit}>
        <SettingDialogFields>
          <SettingDialogField
            title={t("settings:SETTINGS_SYSTEM_EMAIL_TEMPLATE_TEST_RECIPIENT_LABEL")}
            description={t("settings:SETTINGS_SYSTEM_EMAIL_TEMPLATE_TEST_RECIPIENT_DESC")}
          >
            <Input
              type="email"
              required
              autoComplete="email"
              value={recipient}
              onChange={(event) => setRecipient(event.target.value)}
              aria-label={t("settings:SETTINGS_SYSTEM_EMAIL_TEMPLATE_TEST_RECIPIENT_LABEL")}
              placeholder={t("settings:SETTINGS_MESSAGING_MAIL_TEST_PLACEHOLDER")}
            />
          </SettingDialogField>
          <SettingDialogField
            title={t("settings:SETTINGS_SYSTEM_EMAIL_TEMPLATE_SAMPLE_DATA_LABEL")}
            description={t("settings:SETTINGS_SYSTEM_EMAIL_TEMPLATE_TEST_VARIABLES_DESC")}
          >
            <Textarea
              value={variables}
              onChange={(event) => setVariables(event.target.value)}
              aria-label={t("settings:SETTINGS_SYSTEM_EMAIL_TEMPLATE_SAMPLE_DATA_LABEL")}
              aria-invalid={Boolean(variablesError)}
              className="min-h-44 font-mono text-xs"
            />
            {variablesError ? (
              <p role="alert" className="mt-2 text-footnote text-destructive">
                {variablesError}
              </p>
            ) : null}
          </SettingDialogField>
        </SettingDialogFields>
      </form>
    </SettingDialog>
  );
}
