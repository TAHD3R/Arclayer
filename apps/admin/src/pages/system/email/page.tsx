import { useEffect, useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import type { UseFormReturn } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Button } from "@arclayer/ui/button";
import { Input } from "@arclayer/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@arclayer/ui/select";
import { SettingActionGroup } from "@arclayer/ui/setting-action-group";
import { SettingActionItem } from "@arclayer/ui/setting-action-item";
import { SettingDialogFields } from "@arclayer/ui/setting-dialog-field";
import { SettingOverlayFooter } from "@arclayer/ui/setting-overlay-footer";
import { SettingPanel } from "@arclayer/ui/setting-panel";
import { Switch } from "@arclayer/ui/switch";
import { Textarea } from "@arclayer/ui/textarea";
import { useSavingKey } from "@arclayer/hooks/use-saving-key";

import { sendTestEmail } from "@/api/mail";
import type { MailProviderId } from "@/api/mail";
import { ContentGuard } from "@/layouts/page-shell/content-guard";
import { getFieldErrorMessage, validateFormFields } from "@/lib/forms/rhf-form-helpers";
import { notifyError, notifySuccessText } from "@/lib/notifications";
import { type SettingOverlayConfig, useSettingOverlays } from "@/hooks/use-setting-overlays";
import {
  getSystemSettingsSection,
  getSystemSettingsSecrets,
  readBooleanValue,
  readNumberValue,
  readRecordValue,
  readStringValue,
  usePatchSystemCoreSettings,
  useSystemCoreSettings,
} from "@/pages/system/hooks/use-system-core-settings";
import {
  OverlayField,
  OverlayBooleanField,
  joinSummaryParts,
  normalizeOptionalString,
} from "@/pages/system/system-settings-form-utils";

type EmailFormValues = {
  mailEnabled: boolean;
  mailProvider: MailProviderId;
  mailServer: string;
  mailPort: string;
  mailUsername: string;
  mailPassword: string;
  mailUseCredentials: boolean;
  mailFrom: string;
  mailFromName: string;
  mailStarttls: boolean;
  mailSslTls: boolean;
  resendApiKey: string;
  resendMailFrom: string;
  resendMailFromName: string;
  cloudflareApiToken: string;
  cloudflareMailFrom: string;
  cloudflareMailFromName: string;
  cloudflareApiUrl: string;
  sesRegion: string;
  sesMailFrom: string;
  sesMailFromName: string;
  fallbackChain: string;
  retryMaxAttempts: string;
  retryBackoffSeconds: string;
};

type EmailOverlayKey = "provider" | "smtp" | "resend" | "cloudflare" | "ses" | "delivery";

const EMAIL_PROVIDER_OPTIONS: Array<{ value: MailProviderId; labelKey: string }> = [
  { value: "smtp", labelKey: "SETTINGS_MESSAGING_MAIL_PROVIDER_SMTP" },
  { value: "resend", labelKey: "SETTINGS_MESSAGING_MAIL_PROVIDER_RESEND" },
  { value: "cloudflare", labelKey: "SETTINGS_MESSAGING_MAIL_PROVIDER_CLOUDFLARE" },
  { value: "ses", labelKey: "SETTINGS_MESSAGING_MAIL_PROVIDER_SES" },
];

function normalizeProvider(value: string | null): MailProviderId {
  if (value === "resend" || value === "cloudflare" || value === "ses") return value;
  return "smtp";
}

function buildInitialValues(
  input: ReturnType<typeof useSystemCoreSettings>["coreSettings"],
): EmailFormValues {
  const mail = getSystemSettingsSection(input, "mail");
  const providers = readRecordValue(mail, "providers");
  const smtp = readRecordValue(providers, "smtp");
  const resend = readRecordValue(providers, "resend");
  const cloudflare = readRecordValue(providers, "cloudflare");
  const ses = readRecordValue(providers, "ses");
  const retry = readRecordValue(mail, "retry");
  const fallbackChain = mail.fallback_chain;
  const retryBackoff = retry.backoff_seconds;

  return {
    mailEnabled: Boolean(readBooleanValue(mail, "enabled")),
    mailProvider: normalizeProvider(readStringValue(mail, "provider")),
    mailServer: readStringValue(smtp, "server") ?? readStringValue(mail, "server") ?? "localhost",
    mailPort: String(readNumberValue(smtp, "port") ?? readNumberValue(mail, "port") ?? 587),
    mailUsername: readStringValue(smtp, "username") ?? readStringValue(mail, "username") ?? "",
    mailPassword: "",
    mailUseCredentials:
      readBooleanValue(smtp, "use_credentials") ??
      readBooleanValue(mail, "use_credentials") ??
      true,
    mailFrom:
      readStringValue(smtp, "mail_from") ??
      readStringValue(mail, "mail_from") ??
      "noreply@example.com",
    mailFromName:
      readStringValue(smtp, "mail_from_name") ??
      readStringValue(mail, "mail_from_name") ??
      "Arclayer",
    mailStarttls: readBooleanValue(smtp, "starttls") ?? Boolean(readBooleanValue(mail, "starttls")),
    mailSslTls: readBooleanValue(smtp, "ssl_tls") ?? Boolean(readBooleanValue(mail, "ssl_tls")),
    resendApiKey: "",
    resendMailFrom: readStringValue(resend, "mail_from") ?? "noreply@example.com",
    resendMailFromName: readStringValue(resend, "mail_from_name") ?? "Arclayer",
    cloudflareApiToken: "",
    cloudflareMailFrom: readStringValue(cloudflare, "mail_from") ?? "noreply@example.com",
    cloudflareMailFromName: readStringValue(cloudflare, "mail_from_name") ?? "Arclayer",
    cloudflareApiUrl:
      readStringValue(cloudflare, "api_url") ?? "https://api.mailchannels.net/tx/v1/send",
    sesRegion: readStringValue(ses, "region") ?? "",
    sesMailFrom: readStringValue(ses, "mail_from") ?? "noreply@example.com",
    sesMailFromName: readStringValue(ses, "mail_from_name") ?? "Arclayer",
    fallbackChain: Array.isArray(fallbackChain)
      ? fallbackChain.filter((item): item is string => typeof item === "string").join("\n")
      : "",
    retryMaxAttempts: String(readNumberValue(retry, "max_attempts") ?? 3),
    retryBackoffSeconds: Array.isArray(retryBackoff)
      ? retryBackoff.filter((item): item is number => typeof item === "number").join(", ")
      : "1, 2, 4",
  };
}

function formatTransportSummary(params: {
  starttls: boolean;
  sslTls: boolean;
  t: (key: string) => string;
}) {
  const parts: string[] = [];
  if (params.starttls) parts.push(params.t("settings:SETTINGS_MESSAGING_MAIL_STARTTLS"));
  if (params.sslTls) parts.push(params.t("settings:SETTINGS_MESSAGING_MAIL_SSL_TLS"));
  return parts.length > 0
    ? parts.join(" / ")
    : params.t("settings:SETTINGS_SYSTEM_EMAIL_TRANSPORT_NONE");
}

function ProviderCredentialFields(props: {
  form: UseFormReturn<EmailFormValues>;
  apiKeyName: "resendApiKey" | "cloudflareApiToken";
  mailFromName: "resendMailFrom" | "cloudflareMailFrom";
  mailFromNameName: "resendMailFromName" | "cloudflareMailFromName";
  apiKeyLabel: string;
  apiKeyDescription: string;
  mailFromLabel: string;
  mailFromNameLabel: string;
}) {
  return (
    <SettingDialogFields>
      <Controller
        control={props.form.control}
        name={props.apiKeyName}
        render={({ field }) => (
          <OverlayField label={props.apiKeyLabel} description={props.apiKeyDescription}>
            <Input {...field} type="password" autoComplete="new-password" />
          </OverlayField>
        )}
      />
      <Controller
        control={props.form.control}
        name={props.mailFromName}
        render={({ field }) => (
          <OverlayField label={props.mailFromLabel}>
            <Input {...field} autoComplete="off" />
          </OverlayField>
        )}
      />
      <Controller
        control={props.form.control}
        name={props.mailFromNameName}
        render={({ field }) => (
          <OverlayField label={props.mailFromNameLabel}>
            <Input {...field} autoComplete="off" />
          </OverlayField>
        )}
      />
    </SettingDialogFields>
  );
}

export function SystemSettingsEmailPage() {
  const { t } = useTranslation(["settings"]);
  const { savingKey, withSavingKey } = useSavingKey();
  const coreSettingsQuery = useSystemCoreSettings();
  const patchMutation = usePatchSystemCoreSettings();
  const secrets = getSystemSettingsSecrets(coreSettingsQuery.coreSettings);
  const hasMailPasswordSecret = Boolean(secrets["mail.password"]);
  const hasResendSecret = Boolean(secrets["mail.providers.resend.api_key"]);
  const hasCloudflareSecret = Boolean(secrets["mail.providers.cloudflare.api_token"]);
  const [testRecipient, setTestRecipient] = useState("");
  const [isTestingEmail, setIsTestingEmail] = useState(false);

  const initialValues = useMemo(
    () => buildInitialValues(coreSettingsQuery.coreSettings),
    [coreSettingsQuery.coreSettings],
  );

  const form = useForm<EmailFormValues>({
    defaultValues: initialValues,
    mode: "onSubmit",
  });

  useEffect(() => {
    if (!coreSettingsQuery.coreSettings) return;
    if (form.formState.isDirty) return;
    form.reset(initialValues);
  }, [coreSettingsQuery.coreSettings, form, initialValues]);

  const persistPatch = async (patch: Record<string, unknown>, nextValues: EmailFormValues) => {
    await patchMutation.mutateAsync(patch);
    form.reset(nextValues);
    notifySuccessText(t("settings:SETTINGS_SAVED"));
  };

  const setMailEnabled = (next: boolean) =>
    withSavingKey("mail.enabled", async () => {
      await persistPatch(
        { mail: { enabled: next } },
        {
          ...form.getValues(),
          mailEnabled: next,
          mailPassword: "",
        },
      );
    });

  const saveProvider = () =>
    withSavingKey("mail.provider", async () => {
      const values = await validateFormFields(form, ["mailProvider"]);
      await persistPatch(
        { mail: { provider: values.mailProvider } },
        {
          ...form.getValues(),
          mailProvider: values.mailProvider,
        },
      );
    });

  const saveMailConfig = () =>
    withSavingKey("mail.config", async () => {
      const values = await validateFormFields(form, [
        "mailServer",
        "mailPort",
        "mailUsername",
        "mailPassword",
        "mailUseCredentials",
        "mailFrom",
        "mailFromName",
        "mailStarttls",
        "mailSslTls",
      ]);
      const port = Number(values.mailPort || 0);
      if (!Number.isInteger(port) || port <= 0 || port > 65535) {
        form.setError("mailPort", {
          type: "validate",
          message: t("settings:SETTINGS_VALIDATION_PORT_INVALID"),
        });
        throw new Error("FORM_VALIDATION_FAILED");
      }
      if (values.mailStarttls && values.mailSslTls) {
        const message = t("settings:MAIL_TRANSPORT_CONFLICT");
        form.setError("mailStarttls", { type: "validate", message });
        form.setError("mailSslTls", { type: "validate", message });
        throw new Error("FORM_VALIDATION_FAILED");
      }

      const patchValue: Record<string, unknown> = {
        server: String(values.mailServer || "").trim() || "localhost",
        port,
        username: normalizeOptionalString(values.mailUsername),
        use_credentials: Boolean(values.mailUseCredentials),
        mail_from: String(values.mailFrom || "").trim() || "noreply@example.com",
        mail_from_name: String(values.mailFromName || "").trim() || "Arclayer",
        starttls: Boolean(values.mailStarttls),
        ssl_tls: Boolean(values.mailSslTls),
      };
      const password = String(values.mailPassword || "").trim();
      if (password) {
        patchValue.password = password;
      }

      await persistPatch(
        { mail: { providers: { smtp: patchValue }, ...patchValue } },
        {
          ...form.getValues(),
          mailServer: String(values.mailServer || "").trim() || "localhost",
          mailPort: String(port),
          mailUsername: String(values.mailUsername || "").trim(),
          mailPassword: "",
          mailUseCredentials: Boolean(values.mailUseCredentials),
          mailFrom: String(values.mailFrom || "").trim() || "noreply@example.com",
          mailFromName: String(values.mailFromName || "").trim() || "Arclayer",
          mailStarttls: Boolean(values.mailStarttls),
          mailSslTls: Boolean(values.mailSslTls),
        },
      );
    });

  const saveProviderConfig = (provider: "resend" | "cloudflare" | "ses") =>
    withSavingKey(`mail.${provider}`, async () => {
      const values = form.getValues();
      const providerPatch: Record<string, unknown> = {};
      if (provider === "resend") {
        providerPatch.mail_from =
          String(values.resendMailFrom || "").trim() || "noreply@example.com";
        providerPatch.mail_from_name = String(values.resendMailFromName || "").trim() || "Arclayer";
        const apiKey = String(values.resendApiKey || "").trim();
        if (apiKey) providerPatch.api_key = apiKey;
      }
      if (provider === "cloudflare") {
        providerPatch.mail_from =
          String(values.cloudflareMailFrom || "").trim() || "noreply@example.com";
        providerPatch.mail_from_name =
          String(values.cloudflareMailFromName || "").trim() || "Arclayer";
        providerPatch.api_url =
          String(values.cloudflareApiUrl || "").trim() || "https://api.mailchannels.net/tx/v1/send";
        const apiToken = String(values.cloudflareApiToken || "").trim();
        if (apiToken) providerPatch.api_token = apiToken;
      }
      if (provider === "ses") {
        providerPatch.region = String(values.sesRegion || "").trim();
        providerPatch.mail_from = String(values.sesMailFrom || "").trim() || "noreply@example.com";
        providerPatch.mail_from_name = String(values.sesMailFromName || "").trim() || "Arclayer";
      }
      await persistPatch(
        { mail: { providers: { [provider]: providerPatch } } },
        {
          ...values,
          resendApiKey: "",
          cloudflareApiToken: "",
        },
      );
    });

  const saveDeliveryPolicy = () =>
    withSavingKey("mail.delivery", async () => {
      const values = await validateFormFields(form, [
        "fallbackChain",
        "retryMaxAttempts",
        "retryBackoffSeconds",
      ]);
      const maxAttempts = Number(values.retryMaxAttempts || 0);
      if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 10) {
        form.setError("retryMaxAttempts", {
          type: "validate",
          message: t("settings:SETTINGS_MESSAGING_MAIL_RETRY_INVALID"),
        });
        throw new Error("FORM_VALIDATION_FAILED");
      }
      const fallbackChain = String(values.fallbackChain || "")
        .split(/\r?\n|,/)
        .map((item) => item.trim())
        .filter(Boolean);
      const backoffSeconds = String(values.retryBackoffSeconds || "")
        .split(",")
        .map((item) => Number(item.trim()))
        .filter((item) => Number.isInteger(item) && item >= 0);
      await persistPatch(
        {
          mail: {
            fallback_chain: fallbackChain,
            retry: { max_attempts: maxAttempts, backoff_seconds: backoffSeconds },
          },
        },
        {
          ...form.getValues(),
          fallbackChain: fallbackChain.join("\n"),
          retryMaxAttempts: String(maxAttempts),
          retryBackoffSeconds: backoffSeconds.join(", "),
        },
      );
    });

  const overlayConfigs = useMemo<readonly SettingOverlayConfig<EmailOverlayKey>[]>(() => {
    const mailServerError = getFieldErrorMessage(form, "mailServer");
    const mailPortError = getFieldErrorMessage(form, "mailPort");
    const mailFromError = getFieldErrorMessage(form, "mailFrom");
    const mailFromNameError = getFieldErrorMessage(form, "mailFromName");
    const mailUseCredentialsError = getFieldErrorMessage(form, "mailUseCredentials");
    const mailStarttlsError = getFieldErrorMessage(form, "mailStarttls");
    const mailSslTlsError = getFieldErrorMessage(form, "mailSslTls");

    return [
      {
        key: "provider",
        type: "sheet",
        title: t("settings:SETTINGS_MESSAGING_MAIL_PROVIDER_TITLE"),
        description: t("settings:SETTINGS_MESSAGING_MAIL_PROVIDER_DESC"),
        footer: (ctx) => (
          <SettingOverlayFooter
            close={ctx.close}
            backText={t("common:CANCEL")}
            saveText={t("settings:SETTINGS_SAVE")}
            saveLoading={savingKey === "mail.provider"}
            disabled={patchMutation.isPending}
            onSave={saveProvider}
          />
        ),
        content: () => (
          <SettingDialogFields>
            <Controller
              control={form.control}
              name="mailProvider"
              render={({ field }) => (
                <OverlayField label={t("settings:SETTINGS_MESSAGING_MAIL_PROVIDER_ACTIVE")}>
                  <Select
                    value={field.value}
                    onValueChange={(value) => field.onChange(normalizeProvider(value))}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent position="popper" align="start">
                      {EMAIL_PROVIDER_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {t(`settings:${option.labelKey}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </OverlayField>
              )}
            />
          </SettingDialogFields>
        ),
      },
      {
        key: "smtp",
        type: "sheet",
        title: t("settings:SETTINGS_MESSAGING_MAIL_CONFIG_TITLE"),
        description: t("settings:SETTINGS_MESSAGING_MAIL_CONFIG_SHEET_DESC"),
        footer: (ctx) => (
          <SettingOverlayFooter
            close={ctx.close}
            backText={t("common:CANCEL")}
            saveText={t("settings:SETTINGS_SAVE")}
            saveLoading={savingKey === "mail.config"}
            disabled={patchMutation.isPending}
            onSave={saveMailConfig}
          />
        ),
        content: () => (
          <SettingDialogFields>
            <Controller
              control={form.control}
              name="mailServer"
              render={({ field }) => (
                <OverlayField
                  label={t("settings:SETTINGS_MESSAGING_MAIL_SERVER")}
                  message={mailServerError}
                >
                  <Input {...field} placeholder="smtp.example.com" />
                </OverlayField>
              )}
            />
            <Controller
              control={form.control}
              name="mailPort"
              render={({ field }) => (
                <OverlayField
                  label={t("settings:SETTINGS_MESSAGING_MAIL_PORT")}
                  message={mailPortError}
                >
                  <Input {...field} type="number" inputMode="numeric" />
                </OverlayField>
              )}
            />
            <Controller
              control={form.control}
              name="mailUsername"
              render={({ field }) => (
                <OverlayField label={t("settings:SETTINGS_MESSAGING_MAIL_USERNAME")}>
                  <Input {...field} autoComplete="off" />
                </OverlayField>
              )}
            />
            <Controller
              control={form.control}
              name="mailPassword"
              render={({ field }) => (
                <OverlayField
                  label={t("settings:SETTINGS_MESSAGING_MAIL_PASSWORD")}
                  description={
                    hasMailPasswordSecret
                      ? t("settings:SETTINGS_MESSAGING_MAIL_PASSWORD_SECRET_SET")
                      : t("settings:SETTINGS_MESSAGING_MAIL_PASSWORD_SECRET_NOT_SET")
                  }
                >
                  <Input
                    {...field}
                    type="password"
                    autoComplete="new-password"
                    placeholder={t("settings:SETTINGS_MESSAGING_MAIL_PASSWORD_PLACEHOLDER")}
                  />
                </OverlayField>
              )}
            />
            <Controller
              control={form.control}
              name="mailUseCredentials"
              render={({ field }) => (
                <OverlayBooleanField
                  label={t("settings:SETTINGS_MESSAGING_MAIL_USE_CREDENTIALS")}
                  description={t("settings:SETTINGS_SYSTEM_EMAIL_USE_CREDENTIALS_HELP")}
                  message={mailUseCredentialsError}
                  checked={Boolean(field.value)}
                  onCheckedChange={field.onChange}
                  stateLabel={
                    field.value ? t("settings:SETTINGS_ENABLED") : t("settings:SETTINGS_DISABLED")
                  }
                />
              )}
            />
            <Controller
              control={form.control}
              name="mailFrom"
              render={({ field }) => (
                <OverlayField
                  label={t("settings:SETTINGS_MESSAGING_MAIL_FROM")}
                  message={mailFromError}
                >
                  <Input {...field} autoComplete="off" />
                </OverlayField>
              )}
            />
            <Controller
              control={form.control}
              name="mailFromName"
              render={({ field }) => (
                <OverlayField
                  label={t("settings:SETTINGS_MESSAGING_MAIL_FROM_NAME")}
                  message={mailFromNameError}
                >
                  <Input {...field} autoComplete="off" />
                </OverlayField>
              )}
            />
            <div className="grid gap-4 md:grid-cols-2">
              <Controller
                control={form.control}
                name="mailStarttls"
                render={({ field }) => (
                  <OverlayBooleanField
                    label={t("settings:SETTINGS_MESSAGING_MAIL_STARTTLS")}
                    description={t("settings:SETTINGS_SYSTEM_EMAIL_STARTTLS_HELP")}
                    message={mailStarttlsError}
                    checked={Boolean(field.value)}
                    onCheckedChange={field.onChange}
                    stateLabel={
                      field.value ? t("settings:SETTINGS_ENABLED") : t("settings:SETTINGS_DISABLED")
                    }
                  />
                )}
              />
              <Controller
                control={form.control}
                name="mailSslTls"
                render={({ field }) => (
                  <OverlayBooleanField
                    label={t("settings:SETTINGS_MESSAGING_MAIL_SSL_TLS")}
                    description={t("settings:SETTINGS_SYSTEM_EMAIL_SSL_TLS_HELP")}
                    message={mailSslTlsError}
                    checked={Boolean(field.value)}
                    onCheckedChange={field.onChange}
                    stateLabel={
                      field.value ? t("settings:SETTINGS_ENABLED") : t("settings:SETTINGS_DISABLED")
                    }
                  />
                )}
              />
            </div>
          </SettingDialogFields>
        ),
      },
      {
        key: "resend",
        type: "sheet",
        title: t("settings:SETTINGS_MESSAGING_MAIL_RESEND_TITLE"),
        description: t("settings:SETTINGS_MESSAGING_MAIL_RESEND_DESC"),
        footer: (ctx) => (
          <SettingOverlayFooter
            close={ctx.close}
            backText={t("common:CANCEL")}
            saveText={t("settings:SETTINGS_SAVE")}
            saveLoading={savingKey === "mail.resend"}
            disabled={patchMutation.isPending}
            onSave={() => saveProviderConfig("resend")}
          />
        ),
        content: () => (
          <ProviderCredentialFields
            form={form}
            apiKeyName="resendApiKey"
            mailFromName="resendMailFrom"
            mailFromNameName="resendMailFromName"
            apiKeyLabel={t("settings:SETTINGS_MESSAGING_MAIL_RESEND_API_KEY")}
            apiKeyDescription={
              hasResendSecret
                ? t("settings:SETTINGS_MESSAGING_MAIL_PROVIDER_SECRET_SET")
                : t("settings:SETTINGS_MESSAGING_MAIL_PROVIDER_SECRET_NOT_SET")
            }
            mailFromLabel={t("settings:SETTINGS_MESSAGING_MAIL_FROM")}
            mailFromNameLabel={t("settings:SETTINGS_MESSAGING_MAIL_FROM_NAME")}
          />
        ),
      },
      {
        key: "cloudflare",
        type: "sheet",
        title: t("settings:SETTINGS_MESSAGING_MAIL_CLOUDFLARE_TITLE"),
        description: t("settings:SETTINGS_MESSAGING_MAIL_CLOUDFLARE_DESC"),
        footer: (ctx) => (
          <SettingOverlayFooter
            close={ctx.close}
            backText={t("common:CANCEL")}
            saveText={t("settings:SETTINGS_SAVE")}
            saveLoading={savingKey === "mail.cloudflare"}
            disabled={patchMutation.isPending}
            onSave={() => saveProviderConfig("cloudflare")}
          />
        ),
        content: () => (
          <SettingDialogFields>
            <Controller
              control={form.control}
              name="cloudflareApiToken"
              render={({ field }) => (
                <OverlayField
                  label={t("settings:SETTINGS_MESSAGING_MAIL_CLOUDFLARE_API_TOKEN")}
                  description={
                    hasCloudflareSecret
                      ? t("settings:SETTINGS_MESSAGING_MAIL_PROVIDER_SECRET_SET")
                      : t("settings:SETTINGS_MESSAGING_MAIL_PROVIDER_SECRET_NOT_SET")
                  }
                >
                  <Input {...field} type="password" autoComplete="new-password" />
                </OverlayField>
              )}
            />
            <Controller
              control={form.control}
              name="cloudflareMailFrom"
              render={({ field }) => (
                <OverlayField label={t("settings:SETTINGS_MESSAGING_MAIL_FROM")}>
                  <Input {...field} autoComplete="off" />
                </OverlayField>
              )}
            />
            <Controller
              control={form.control}
              name="cloudflareMailFromName"
              render={({ field }) => (
                <OverlayField label={t("settings:SETTINGS_MESSAGING_MAIL_FROM_NAME")}>
                  <Input {...field} autoComplete="off" />
                </OverlayField>
              )}
            />
            <Controller
              control={form.control}
              name="cloudflareApiUrl"
              render={({ field }) => (
                <OverlayField label={t("settings:SETTINGS_MESSAGING_MAIL_CLOUDFLARE_API_URL")}>
                  <Input {...field} autoComplete="off" />
                </OverlayField>
              )}
            />
          </SettingDialogFields>
        ),
      },
      {
        key: "ses",
        type: "sheet",
        title: t("settings:SETTINGS_MESSAGING_MAIL_SES_TITLE"),
        description: t("settings:SETTINGS_MESSAGING_MAIL_SES_DESC"),
        footer: (ctx) => (
          <SettingOverlayFooter
            close={ctx.close}
            backText={t("common:CANCEL")}
            saveText={t("settings:SETTINGS_SAVE")}
            saveLoading={savingKey === "mail.ses"}
            disabled={patchMutation.isPending}
            onSave={() => saveProviderConfig("ses")}
          />
        ),
        content: () => (
          <SettingDialogFields>
            <Controller
              control={form.control}
              name="sesRegion"
              render={({ field }) => (
                <OverlayField label={t("settings:SETTINGS_MESSAGING_MAIL_SES_REGION")}>
                  <Input {...field} placeholder="us-east-1" autoComplete="off" />
                </OverlayField>
              )}
            />
            <Controller
              control={form.control}
              name="sesMailFrom"
              render={({ field }) => (
                <OverlayField label={t("settings:SETTINGS_MESSAGING_MAIL_FROM")}>
                  <Input {...field} autoComplete="off" />
                </OverlayField>
              )}
            />
            <Controller
              control={form.control}
              name="sesMailFromName"
              render={({ field }) => (
                <OverlayField label={t("settings:SETTINGS_MESSAGING_MAIL_FROM_NAME")}>
                  <Input {...field} autoComplete="off" />
                </OverlayField>
              )}
            />
          </SettingDialogFields>
        ),
      },
      {
        key: "delivery",
        type: "sheet",
        title: t("settings:SETTINGS_MESSAGING_MAIL_DELIVERY_POLICY_TITLE"),
        description: t("settings:SETTINGS_MESSAGING_MAIL_DELIVERY_POLICY_DESC"),
        footer: (ctx) => (
          <SettingOverlayFooter
            close={ctx.close}
            backText={t("common:CANCEL")}
            saveText={t("settings:SETTINGS_SAVE")}
            saveLoading={savingKey === "mail.delivery"}
            disabled={patchMutation.isPending}
            onSave={saveDeliveryPolicy}
          />
        ),
        content: () => (
          <SettingDialogFields>
            <Controller
              control={form.control}
              name="fallbackChain"
              render={({ field }) => (
                <OverlayField
                  label={t("settings:SETTINGS_MESSAGING_MAIL_FALLBACK_CHAIN")}
                  description={t("settings:SETTINGS_MESSAGING_MAIL_FALLBACK_CHAIN_DESC")}
                >
                  <Textarea {...field} rows={4} />
                </OverlayField>
              )}
            />
            <Controller
              control={form.control}
              name="retryMaxAttempts"
              render={({ field }) => (
                <OverlayField label={t("settings:SETTINGS_MESSAGING_MAIL_RETRY_MAX_ATTEMPTS")}>
                  <Input {...field} type="number" inputMode="numeric" />
                </OverlayField>
              )}
            />
            <Controller
              control={form.control}
              name="retryBackoffSeconds"
              render={({ field }) => (
                <OverlayField
                  label={t("settings:SETTINGS_MESSAGING_MAIL_RETRY_BACKOFF")}
                  description={t("settings:SETTINGS_MESSAGING_MAIL_RETRY_BACKOFF_DESC")}
                >
                  <Input {...field} autoComplete="off" />
                </OverlayField>
              )}
            />
          </SettingDialogFields>
        ),
      },
    ] as const;
  }, [
    form,
    hasCloudflareSecret,
    hasMailPasswordSecret,
    hasResendSecret,
    patchMutation.isPending,
    saveDeliveryPolicy,
    saveMailConfig,
    saveProvider,
    saveProviderConfig,
    savingKey,
    t,
  ]);

  const overlays = useSettingOverlays(overlayConfigs);
  const openOverlay = (key: EmailOverlayKey) => {
    form.reset(initialValues);
    overlays.open(key);
  };
  const mailEnabled = initialValues.mailEnabled;
  const mailProvider = initialValues.mailProvider;
  const mailServer = initialValues.mailServer;
  const mailPort = initialValues.mailPort;
  const mailFrom = initialValues.mailFrom;
  const mailStarttls = initialValues.mailStarttls;
  const mailSslTls = initialValues.mailSslTls;
  const providerLabel = t(
    `settings:${EMAIL_PROVIDER_OPTIONS.find((option) => option.value === mailProvider)?.labelKey ?? "SETTINGS_MESSAGING_MAIL_PROVIDER_SMTP"}`,
  );

  return (
    <ContentGuard
      loading={coreSettingsQuery.isLoading && !coreSettingsQuery.coreSettings}
      error={coreSettingsQuery.error}
      onRetry={() => void coreSettingsQuery.refetch()}
    >
      <div className="space-y-8">
        <SettingPanel
          title={t("settings:SETTINGS_SYSTEM_EMAIL_PAGE_TITLE")}
          description={t("settings:SETTINGS_SYSTEM_EMAIL_PAGE_DESC")}
          bordered={false}
        >
          <SettingActionGroup>
            <SettingActionItem
              title={t("settings:SETTINGS_MESSAGING_MAIL_ENABLED_TITLE")}
              summary={
                mailEnabled ? t("settings:SETTINGS_ENABLED") : t("settings:SETTINGS_DISABLED")
              }
              description={t("settings:SETTINGS_MESSAGING_MAIL_ENABLED_DESC")}
              right={
                <Switch
                  checked={mailEnabled}
                  disabled={patchMutation.isPending || savingKey === "mail.enabled"}
                  onCheckedChange={(checked) => {
                    void setMailEnabled(Boolean(checked));
                  }}
                />
              }
              showChevron={false}
              as="div"
            />
            <SettingActionItem
              title={t("settings:SETTINGS_MESSAGING_MAIL_PROVIDER_TITLE")}
              summary={providerLabel}
              description={t("settings:SETTINGS_MESSAGING_MAIL_PROVIDER_SUMMARY_DESC")}
              onTrigger={() => openOverlay("provider")}
            />
            <SettingActionItem
              title={t("settings:SETTINGS_MESSAGING_MAIL_CONFIG_TITLE")}
              summary={`${mailServer}:${mailPort}`}
              description={joinSummaryParts([
                mailFrom,
                formatTransportSummary({
                  starttls: mailStarttls,
                  sslTls: mailSslTls,
                  t,
                }),
              ])}
              onTrigger={() => openOverlay("smtp")}
            />
            <SettingActionItem
              title={t("settings:SETTINGS_MESSAGING_MAIL_RESEND_TITLE")}
              summary={initialValues.resendMailFrom}
              description={t("settings:SETTINGS_MESSAGING_MAIL_RESEND_SUMMARY_DESC")}
              onTrigger={() => openOverlay("resend")}
            />
            <SettingActionItem
              title={t("settings:SETTINGS_MESSAGING_MAIL_CLOUDFLARE_TITLE")}
              summary={initialValues.cloudflareMailFrom}
              description={t("settings:SETTINGS_MESSAGING_MAIL_CLOUDFLARE_SUMMARY_DESC")}
              onTrigger={() => openOverlay("cloudflare")}
            />
            <SettingActionItem
              title={t("settings:SETTINGS_MESSAGING_MAIL_SES_TITLE")}
              summary={
                initialValues.sesRegion || t("settings:SETTINGS_SYSTEM_EMAIL_NOT_CONFIGURED")
              }
              description={t("settings:SETTINGS_MESSAGING_MAIL_SES_SUMMARY_DESC")}
              onTrigger={() => openOverlay("ses")}
            />
            <SettingActionItem
              title={t("settings:SETTINGS_MESSAGING_MAIL_DELIVERY_POLICY_TITLE")}
              summary={t("settings:SETTINGS_MESSAGING_MAIL_DELIVERY_POLICY_SUMMARY", {
                count: Number(initialValues.retryMaxAttempts),
              })}
              description={t("settings:SETTINGS_MESSAGING_MAIL_DELIVERY_POLICY_SUMMARY_DESC")}
              onTrigger={() => openOverlay("delivery")}
            />
          </SettingActionGroup>
        </SettingPanel>

        <section className="space-y-3">
          <header className="space-y-1">
            <h2 className="text-title2 font-bold">
              {t("settings:SETTINGS_MESSAGING_MAIL_TEST_TITLE")}
            </h2>
            <p className="text-body text-label-secondary">
              {mailEnabled
                ? t("settings:SETTINGS_MESSAGING_MAIL_TEST_DESC")
                : t("settings:SETTINGS_SYSTEM_EMAIL_TEST_DISABLED_HINT")}
            </p>
          </header>

          <div className="flex flex-col gap-3 md:flex-row">
            <Input
              value={testRecipient}
              onChange={(event) => setTestRecipient(event.target.value)}
              placeholder={t("settings:SETTINGS_MESSAGING_MAIL_TEST_PLACEHOLDER")}
              autoComplete="off"
            />
            <Button
              type="button"
              loading={isTestingEmail}
              disabled={!mailEnabled || !testRecipient.trim()}
              onClick={() => {
                const recipient = testRecipient.trim();
                if (!recipient) return;
                setIsTestingEmail(true);
                sendTestEmail({ recipient })
                  .then(() => notifySuccessText(t("settings:SETTINGS_MESSAGING_MAIL_TEST_SUCCESS")))
                  .catch((error) => notifyError(error))
                  .finally(() => setIsTestingEmail(false));
              }}
            >
              {t("settings:SETTINGS_MESSAGING_MAIL_TEST_ACTION")}
            </Button>
          </div>
        </section>

        {overlays.renderOverlays()}
      </div>
    </ContentGuard>
  );
}
