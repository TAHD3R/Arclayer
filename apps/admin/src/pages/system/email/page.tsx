import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Controller, useForm } from "react-hook-form";
import type { UseFormReturn } from "react-hook-form";
import { useTranslation } from "react-i18next";

import { Badge } from "@arclayer/ui/badge";
import { Button } from "@arclayer/ui/button";
import { Checkbox } from "@arclayer/ui/checkbox";
import { Input } from "@arclayer/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@arclayer/ui/select";
import { Switch } from "@arclayer/ui/switch";
import { useSavingKey } from "@arclayer/hooks/use-saving-key";

import { listMailProviders, sendTestEmail, switchMailProvider } from "@/api/mail";
import type { MailProviderId, MailProviderInfo } from "@/api/mail";
import { ContentGuard } from "@/layouts/page-shell/content-guard";
import { getFieldErrorMessage, validateFormFields } from "@/lib/forms/rhf-form-helpers";
import { notifyError, notifySuccessText } from "@/lib/notifications";
import {
  SystemSettingField,
  SystemSettingFooterActions,
  SystemSettingItem,
  SystemSettingRow,
  SystemSettingStack,
} from "@/pages/system/components/system-setting-item";
import {
  getSystemSettingsSection,
  getSystemSettingsSecrets,
  readBooleanValue,
  readNumberValue,
  readRecordValue,
  readStringArrayValue,
  readStringValue,
  usePatchSystemCoreSettings,
  useSystemCoreSettings,
} from "@/pages/system/hooks/use-system-core-settings";
import { FieldMessage, normalizeOptionalString } from "@/pages/system/system-settings-form-utils";

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
  mailEnabledTemplates: string[];
};

const EMAIL_PROVIDER_OPTIONS: Array<{ value: MailProviderId; labelKey: string }> = [
  { value: "smtp", labelKey: "SETTINGS_MESSAGING_MAIL_PROVIDER_SMTP" },
  { value: "resend", labelKey: "SETTINGS_MESSAGING_MAIL_PROVIDER_RESEND" },
  { value: "cloudflare", labelKey: "SETTINGS_MESSAGING_MAIL_PROVIDER_CLOUDFLARE" },
  { value: "ses", labelKey: "SETTINGS_MESSAGING_MAIL_PROVIDER_SES" },
];
const MAIL_PROVIDER_QUERY_KEY = ["system", "mail", "providers"] as const;
const TEMPLATE_OPTIONS = [
  {
    key: "registration_prompt",
    titleKey: "settings:SETTINGS_MESSAGING_MAIL_TEMPLATE_REG_PROMPT_TITLE",
    descriptionKey: "settings:SETTINGS_MESSAGING_MAIL_TEMPLATE_REG_PROMPT_DESC",
  },
  {
    key: "welcome_email",
    titleKey: "settings:SETTINGS_MESSAGING_MAIL_TEMPLATE_WELCOME_TITLE",
    descriptionKey: "settings:SETTINGS_MESSAGING_MAIL_TEMPLATE_WELCOME_DESC",
  },
] as const;

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
  const preferences = readRecordValue(mail, "preferences");
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
    mailEnabledTemplates: readStringArrayValue(preferences, "enabled_templates"),
  };
}

function FormField(props: {
  label: string;
  description?: string;
  message?: string | null;
  children: React.ReactNode;
}) {
  return (
    <SystemSettingField
      label={props.label}
      description={props.description}
      message={<FieldMessage message={props.message} />}
    >
      {props.children}
    </SystemSettingField>
  );
}

function ToggleField(props: {
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <SystemSettingRow
      title={props.label}
      description={props.description}
      control={<Switch checked={props.checked} onCheckedChange={props.onCheckedChange} />}
    />
  );
}

function ProviderStatusList(props: {
  providers: MailProviderInfo[];
  activeProvider: MailProviderId;
  t: (key: string) => string;
}) {
  if (props.providers.length === 0) return null;
  return (
    <div className="grid gap-2">
      {props.providers.map((provider) => (
        <div
          key={provider.provider_id}
          className="flex min-w-0 flex-wrap items-center justify-between gap-3 py-2"
        >
          <div className="min-w-0">
            <div className="text-headline font-semibold text-label-primary">{provider.label}</div>
            {provider.error ? (
              <div className="mt-1 text-callout text-destructive">{provider.error}</div>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {provider.active || provider.provider_id === props.activeProvider ? (
              <Badge variant="secondary">
                {props.t("settings:SETTINGS_MESSAGING_MAIL_PROVIDER_ACTIVE")}
              </Badge>
            ) : null}
            <Badge variant={provider.configured ? "secondary" : "outline"}>
              {provider.configured
                ? props.t("settings:SETTINGS_SYSTEM_CONFIGURED")
                : props.t("settings:SETTINGS_SYSTEM_NOT_CONFIGURED")}
            </Badge>
            {!provider.available ? (
              <Badge variant="outline">
                {props.t("settings:SETTINGS_SYSTEM_EMAIL_PROVIDER_UNAVAILABLE")}
              </Badge>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}

function buildSmtpPatch(values: EmailFormValues, t: (key: string) => string) {
  const port = Number(values.mailPort || 0);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(t("settings:SETTINGS_VALIDATION_PORT_INVALID"));
  }
  if (values.mailStarttls && values.mailSslTls) {
    throw new Error(t("settings:MAIL_TRANSPORT_CONFLICT"));
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
  return { patchValue, port };
}

function getSenderFieldNames(provider: MailProviderId): {
  from: keyof EmailFormValues;
  name: keyof EmailFormValues;
} {
  if (provider === "resend") return { from: "resendMailFrom", name: "resendMailFromName" };
  if (provider === "cloudflare") {
    return { from: "cloudflareMailFrom", name: "cloudflareMailFromName" };
  }
  if (provider === "ses") return { from: "sesMailFrom", name: "sesMailFromName" };
  return { from: "mailFrom", name: "mailFromName" };
}

function ActiveProviderConfig(props: {
  provider: MailProviderId;
  form: UseFormReturn<EmailFormValues>;
  hasMailPasswordSecret: boolean;
  hasResendSecret: boolean;
  hasCloudflareSecret: boolean;
  t: (key: string) => string;
}) {
  const { form, t } = props;
  if (props.provider === "smtp") {
    return (
      <div className="grid gap-3 md:grid-cols-2">
        <Controller
          control={form.control}
          name="mailServer"
          render={({ field }) => (
            <FormField label={t("settings:SETTINGS_MESSAGING_MAIL_SERVER")}>
              <Input {...field} placeholder="smtp.example.com" />
            </FormField>
          )}
        />
        <Controller
          control={form.control}
          name="mailPort"
          render={({ field }) => (
            <FormField
              label={t("settings:SETTINGS_MESSAGING_MAIL_PORT")}
              message={getFieldErrorMessage(form, "mailPort")}
            >
              <Input {...field} type="number" inputMode="numeric" />
            </FormField>
          )}
        />
        <Controller
          control={form.control}
          name="mailUsername"
          render={({ field }) => (
            <FormField label={t("settings:SETTINGS_MESSAGING_MAIL_USERNAME")}>
              <Input {...field} autoComplete="off" />
            </FormField>
          )}
        />
        <Controller
          control={form.control}
          name="mailPassword"
          render={({ field }) => (
            <FormField
              label={t("settings:SETTINGS_MESSAGING_MAIL_PASSWORD")}
              description={
                props.hasMailPasswordSecret
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
            </FormField>
          )}
        />
        <Controller
          control={form.control}
          name="mailUseCredentials"
          render={({ field }) => (
            <ToggleField
              label={t("settings:SETTINGS_MESSAGING_MAIL_USE_CREDENTIALS")}
              description={t("settings:SETTINGS_SYSTEM_EMAIL_USE_CREDENTIALS_HELP")}
              checked={Boolean(field.value)}
              onCheckedChange={field.onChange}
            />
          )}
        />
        <Controller
          control={form.control}
          name="mailStarttls"
          render={({ field }) => (
            <ToggleField
              label={t("settings:SETTINGS_MESSAGING_MAIL_STARTTLS")}
              description={t("settings:SETTINGS_SYSTEM_EMAIL_STARTTLS_HELP")}
              checked={Boolean(field.value)}
              onCheckedChange={field.onChange}
            />
          )}
        />
        <Controller
          control={form.control}
          name="mailSslTls"
          render={({ field }) => (
            <ToggleField
              label={t("settings:SETTINGS_MESSAGING_MAIL_SSL_TLS")}
              description={t("settings:SETTINGS_SYSTEM_EMAIL_SSL_TLS_HELP")}
              checked={Boolean(field.value)}
              onCheckedChange={field.onChange}
            />
          )}
        />
      </div>
    );
  }

  if (props.provider === "resend") {
    return (
      <div className="grid gap-3 md:grid-cols-2">
        <Controller
          control={form.control}
          name="resendApiKey"
          render={({ field }) => (
            <FormField
              label={t("settings:SETTINGS_MESSAGING_MAIL_RESEND_API_KEY")}
              description={
                props.hasResendSecret
                  ? t("settings:SETTINGS_MESSAGING_MAIL_PROVIDER_SECRET_SET")
                  : t("settings:SETTINGS_MESSAGING_MAIL_PROVIDER_SECRET_NOT_SET")
              }
            >
              <Input {...field} type="password" autoComplete="new-password" />
            </FormField>
          )}
        />
      </div>
    );
  }

  if (props.provider === "cloudflare") {
    return (
      <div className="grid gap-3 md:grid-cols-2">
        <Controller
          control={form.control}
          name="cloudflareApiToken"
          render={({ field }) => (
            <FormField
              label={t("settings:SETTINGS_MESSAGING_MAIL_CLOUDFLARE_API_TOKEN")}
              description={
                props.hasCloudflareSecret
                  ? t("settings:SETTINGS_MESSAGING_MAIL_PROVIDER_SECRET_SET")
                  : t("settings:SETTINGS_MESSAGING_MAIL_PROVIDER_SECRET_NOT_SET")
              }
            >
              <Input {...field} type="password" autoComplete="new-password" />
            </FormField>
          )}
        />
        <Controller
          control={form.control}
          name="cloudflareApiUrl"
          render={({ field }) => (
            <FormField label={t("settings:SETTINGS_MESSAGING_MAIL_CLOUDFLARE_API_URL")}>
              <Input {...field} autoComplete="off" />
            </FormField>
          )}
        />
      </div>
    );
  }

  return (
    <div className="grid gap-3 md:grid-cols-2">
      <Controller
        control={form.control}
        name="sesRegion"
        render={({ field }) => (
          <FormField label={t("settings:SETTINGS_MESSAGING_MAIL_SES_REGION")}>
            <Input {...field} placeholder="us-east-1" autoComplete="off" />
          </FormField>
        )}
      />
    </div>
  );
}

export function SystemSettingsEmailPage() {
  const { t } = useTranslation(["settings"]);
  const { savingKey, withSavingKey } = useSavingKey();
  const coreSettingsQuery = useSystemCoreSettings();
  const patchMutation = usePatchSystemCoreSettings();
  const providersQuery = useQuery({
    queryKey: MAIL_PROVIDER_QUERY_KEY,
    queryFn: listMailProviders,
    retry: false,
    meta: { silent: true },
  });
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
  const values = form.watch();
  const mailProvider = values.mailProvider;
  const senderFields = getSenderFieldNames(mailProvider);

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
      await persistPatch({ mail: { enabled: next } }, { ...form.getValues(), mailEnabled: next });
    });

  const saveProvider = () =>
    withSavingKey("mail.provider", async () => {
      const next = await validateFormFields(form, ["mailProvider"]);
      await switchMailProvider({ provider: next.mailProvider });
      await providersQuery.refetch();
      await persistPatch(
        { mail: { provider: next.mailProvider } },
        { ...form.getValues(), mailProvider: next.mailProvider },
      );
    });

  const saveActiveProviderConfig = () =>
    withSavingKey(`mail.${mailProvider}.config`, async () => {
      const values = form.getValues();
      if (mailProvider === "smtp") {
        try {
          const { patchValue, port } = buildSmtpPatch(values, t);
          await persistPatch(
            { mail: { providers: { smtp: patchValue }, ...patchValue } },
            { ...values, mailPort: String(port), mailPassword: "" },
          );
        } catch (error) {
          notifyError(error);
          throw error;
        }
        return;
      }

      const providerPatch: Record<string, unknown> = {};
      if (mailProvider === "resend") {
        providerPatch.mail_from = values.resendMailFrom.trim() || "noreply@example.com";
        providerPatch.mail_from_name = values.resendMailFromName.trim() || "Arclayer";
        const apiKey = values.resendApiKey.trim();
        if (apiKey) providerPatch.api_key = apiKey;
      }
      if (mailProvider === "cloudflare") {
        providerPatch.mail_from = values.cloudflareMailFrom.trim() || "noreply@example.com";
        providerPatch.mail_from_name = values.cloudflareMailFromName.trim() || "Arclayer";
        providerPatch.api_url =
          values.cloudflareApiUrl.trim() || "https://api.mailchannels.net/tx/v1/send";
        const apiToken = values.cloudflareApiToken.trim();
        if (apiToken) providerPatch.api_token = apiToken;
      }
      if (mailProvider === "ses") {
        providerPatch.region = values.sesRegion.trim();
        providerPatch.mail_from = values.sesMailFrom.trim() || "noreply@example.com";
        providerPatch.mail_from_name = values.sesMailFromName.trim() || "Arclayer";
      }
      await persistPatch(
        { mail: { providers: { [mailProvider]: providerPatch } } },
        { ...values, resendApiKey: "", cloudflareApiToken: "" },
      );
    });

  const saveSenderIdentity = () =>
    withSavingKey("mail.sender", async () => {
      const values = form.getValues();
      const activePatch =
        mailProvider === "smtp"
          ? {
              mail_from: values.mailFrom.trim() || "noreply@example.com",
              mail_from_name: values.mailFromName.trim() || "Arclayer",
            }
          : mailProvider === "resend"
            ? {
                mail_from: values.resendMailFrom.trim() || "noreply@example.com",
                mail_from_name: values.resendMailFromName.trim() || "Arclayer",
              }
            : mailProvider === "cloudflare"
              ? {
                  mail_from: values.cloudflareMailFrom.trim() || "noreply@example.com",
                  mail_from_name: values.cloudflareMailFromName.trim() || "Arclayer",
                }
              : {
                  mail_from: values.sesMailFrom.trim() || "noreply@example.com",
                  mail_from_name: values.sesMailFromName.trim() || "Arclayer",
                };
      await persistPatch(
        {
          mail: {
            ...(mailProvider === "smtp" ? activePatch : {}),
            providers: { [mailProvider]: activePatch },
          },
        },
        values,
      );
    });

  const saveDeliveryPolicy = () =>
    withSavingKey("mail.delivery", async () => {
      const values = form.getValues();
      const maxAttempts = Number(values.retryMaxAttempts || 0);
      if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 10) {
        form.setError("retryMaxAttempts", {
          type: "validate",
          message: t("settings:SETTINGS_MESSAGING_MAIL_RETRY_INVALID"),
        });
        throw new Error("FORM_VALIDATION_FAILED");
      }
      const fallbackChain = values.fallbackChain
        .split(/\r?\n|,/)
        .map((item) => item.trim())
        .filter(Boolean);
      const backoffSeconds = values.retryBackoffSeconds
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
          ...values,
          fallbackChain: fallbackChain.join("\n"),
          retryMaxAttempts: String(maxAttempts),
          retryBackoffSeconds: backoffSeconds.join(", "),
        },
      );
    });

  const saveTemplates = () =>
    withSavingKey("mail.templates", async () => {
      const nextTemplates = Array.from(new Set(form.getValues("mailEnabledTemplates") || []));
      await persistPatch(
        { mail: { preferences: { enabled_templates: nextTemplates } } },
        { ...form.getValues(), mailEnabledTemplates: nextTemplates },
      );
    });

  const enabledDirty = values.mailEnabled !== initialValues.mailEnabled;
  const providerDirty = values.mailProvider !== initialValues.mailProvider;
  const activeConfigDirty =
    mailProvider === "smtp"
      ? [
          "mailServer",
          "mailPort",
          "mailUsername",
          "mailUseCredentials",
          "mailStarttls",
          "mailSslTls",
        ].some(
          (field) =>
            values[field as keyof EmailFormValues] !==
            initialValues[field as keyof EmailFormValues],
        ) || Boolean(values.mailPassword.trim())
      : mailProvider === "resend"
        ? Boolean(values.resendApiKey.trim())
        : mailProvider === "cloudflare"
          ? values.cloudflareApiUrl !== initialValues.cloudflareApiUrl ||
            Boolean(values.cloudflareApiToken.trim())
          : values.sesRegion !== initialValues.sesRegion;
  const senderDirty =
    values[senderFields.from] !== initialValues[senderFields.from] ||
    values[senderFields.name] !== initialValues[senderFields.name];
  const deliveryDirty =
    values.fallbackChain !== initialValues.fallbackChain ||
    values.retryMaxAttempts !== initialValues.retryMaxAttempts ||
    values.retryBackoffSeconds !== initialValues.retryBackoffSeconds;
  const templatesDirty =
    values.mailEnabledTemplates.slice().sort().join("|") !==
    initialValues.mailEnabledTemplates.slice().sort().join("|");

  return (
    <ContentGuard
      loading={coreSettingsQuery.isLoading && !coreSettingsQuery.coreSettings}
      error={coreSettingsQuery.error}
      onRetry={() => void coreSettingsQuery.refetch()}
    >
      <SystemSettingStack>
        <SystemSettingItem
          id="email-delivery"
          title={t("settings:SETTINGS_MESSAGING_MAIL_ENABLED_TITLE")}
          description={t("settings:SETTINGS_MESSAGING_MAIL_ENABLED_DESC")}
          footer={
            <SystemSettingFooterActions
              dirty={enabledDirty}
              pending={savingKey === "mail.enabled" || patchMutation.isPending}
              onReset={() =>
                form.reset({ ...form.getValues(), mailEnabled: initialValues.mailEnabled })
              }
              onSave={() => void setMailEnabled(values.mailEnabled)}
            />
          }
        >
          <ToggleField
            label={t("settings:SETTINGS_MESSAGING_MAIL_ENABLED_TITLE")}
            description={t("settings:SETTINGS_MESSAGING_MAIL_ENABLED_DESC")}
            checked={values.mailEnabled}
            onCheckedChange={(checked) =>
              form.setValue("mailEnabled", checked, { shouldDirty: true })
            }
          />
        </SystemSettingItem>

        <SystemSettingItem
          id="active-provider"
          title={t("settings:SETTINGS_MESSAGING_MAIL_PROVIDER_TITLE")}
          description={t("settings:SETTINGS_MESSAGING_MAIL_PROVIDER_DESC")}
          footer={
            <SystemSettingFooterActions
              dirty={providerDirty}
              pending={savingKey === "mail.provider" || patchMutation.isPending}
              onReset={() =>
                form.reset({ ...form.getValues(), mailProvider: initialValues.mailProvider })
              }
              onSave={() => void saveProvider()}
            />
          }
        >
          <div className="grid gap-4">
            <Controller
              control={form.control}
              name="mailProvider"
              render={({ field }) => (
                <FormField label={t("settings:SETTINGS_MESSAGING_MAIL_PROVIDER_ACTIVE")}>
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
                </FormField>
              )}
            />
            <ProviderStatusList
              providers={providersQuery.data ?? []}
              activeProvider={mailProvider}
              t={t}
            />
          </div>
        </SystemSettingItem>

        <SystemSettingItem
          id="active-provider-config"
          title={t("settings:SETTINGS_SYSTEM_EMAIL_ACTIVE_PROVIDER_CONFIG_TITLE")}
          description={t("settings:SETTINGS_SYSTEM_EMAIL_ACTIVE_PROVIDER_CONFIG_DESC")}
          footer={
            <SystemSettingFooterActions
              dirty={activeConfigDirty}
              pending={savingKey === `mail.${mailProvider}.config` || patchMutation.isPending}
              onReset={() => form.reset(initialValues)}
              onSave={() => void saveActiveProviderConfig()}
            />
          }
        >
          <ActiveProviderConfig
            provider={mailProvider}
            form={form}
            hasMailPasswordSecret={hasMailPasswordSecret}
            hasResendSecret={hasResendSecret}
            hasCloudflareSecret={hasCloudflareSecret}
            t={t}
          />
        </SystemSettingItem>

        <SystemSettingItem
          id="sender-identity"
          title={t("settings:SETTINGS_SYSTEM_EMAIL_SENDER_IDENTITY_TITLE")}
          description={t("settings:SETTINGS_SYSTEM_EMAIL_SENDER_IDENTITY_DESC")}
          footer={
            <SystemSettingFooterActions
              dirty={senderDirty}
              pending={savingKey === "mail.sender" || patchMutation.isPending}
              onReset={() => form.reset(initialValues)}
              onSave={() => void saveSenderIdentity()}
            />
          }
        >
          <div className="grid gap-3 md:grid-cols-2">
            <Controller
              control={form.control}
              name={senderFields.from}
              render={({ field }) => (
                <FormField label={t("settings:SETTINGS_MESSAGING_MAIL_FROM")}>
                  <Input {...field} value={String(field.value)} autoComplete="off" />
                </FormField>
              )}
            />
            <Controller
              control={form.control}
              name={senderFields.name}
              render={({ field }) => (
                <FormField label={t("settings:SETTINGS_MESSAGING_MAIL_FROM_NAME")}>
                  <Input {...field} value={String(field.value)} autoComplete="off" />
                </FormField>
              )}
            />
          </div>
        </SystemSettingItem>

        <SystemSettingItem
          id="delivery-policy"
          title={t("settings:SETTINGS_MESSAGING_MAIL_DELIVERY_POLICY_TITLE")}
          description={t("settings:SETTINGS_MESSAGING_MAIL_DELIVERY_POLICY_DESC")}
          footer={
            <SystemSettingFooterActions
              dirty={deliveryDirty}
              pending={savingKey === "mail.delivery" || patchMutation.isPending}
              onReset={() => form.reset(initialValues)}
              onSave={() => void saveDeliveryPolicy()}
            />
          }
        >
          <div className="grid gap-3 md:grid-cols-3">
            <Controller
              control={form.control}
              name="fallbackChain"
              render={({ field }) => (
                <FormField
                  label={t("settings:SETTINGS_MESSAGING_MAIL_FALLBACK_CHAIN")}
                  description={t("settings:SETTINGS_MESSAGING_MAIL_FALLBACK_CHAIN_DESC")}
                >
                  <Input {...field} autoComplete="off" />
                </FormField>
              )}
            />
            <Controller
              control={form.control}
              name="retryMaxAttempts"
              render={({ field }) => (
                <FormField label={t("settings:SETTINGS_MESSAGING_MAIL_RETRY_MAX_ATTEMPTS")}>
                  <Input {...field} type="number" inputMode="numeric" />
                </FormField>
              )}
            />
            <Controller
              control={form.control}
              name="retryBackoffSeconds"
              render={({ field }) => (
                <FormField
                  label={t("settings:SETTINGS_MESSAGING_MAIL_RETRY_BACKOFF")}
                  description={t("settings:SETTINGS_MESSAGING_MAIL_RETRY_BACKOFF_DESC")}
                >
                  <Input {...field} autoComplete="off" />
                </FormField>
              )}
            />
          </div>
        </SystemSettingItem>

        <SystemSettingItem
          id="template-preferences"
          title={t("settings:SETTINGS_SYSTEM_EMAIL_TEMPLATE_PREFERENCES_TITLE")}
          description={t("settings:SETTINGS_SYSTEM_EMAIL_TEMPLATE_PREFERENCES_DESC")}
          footer={
            <SystemSettingFooterActions
              dirty={templatesDirty}
              pending={savingKey === "mail.templates" || patchMutation.isPending}
              onReset={() => form.reset(initialValues)}
              onSave={() => void saveTemplates()}
            />
          }
        >
          <div className="grid gap-3 md:grid-cols-2">
            {TEMPLATE_OPTIONS.map((template) => {
              const checked = values.mailEnabledTemplates.includes(template.key);
              return (
                <SystemSettingRow
                  key={template.key}
                  title={t(template.titleKey)}
                  description={t(template.descriptionKey)}
                  className="justify-start"
                  control={
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(next) => {
                        const current = form.getValues("mailEnabledTemplates") || [];
                        const nextTemplates = next
                          ? [...current, template.key]
                          : current.filter((item) => item !== template.key);
                        form.setValue("mailEnabledTemplates", Array.from(new Set(nextTemplates)), {
                          shouldDirty: true,
                        });
                      }}
                    />
                  }
                />
              );
            })}
          </div>
        </SystemSettingItem>

        <SystemSettingItem
          id="test-email"
          title={t("settings:SETTINGS_MESSAGING_MAIL_TEST_TITLE")}
          description={
            values.mailEnabled
              ? t("settings:SETTINGS_MESSAGING_MAIL_TEST_DESC")
              : t("settings:SETTINGS_SYSTEM_EMAIL_TEST_DISABLED_HINT")
          }
        >
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
              disabled={!values.mailEnabled || !testRecipient.trim()}
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
        </SystemSettingItem>
      </SystemSettingStack>
    </ContentGuard>
  );
}
