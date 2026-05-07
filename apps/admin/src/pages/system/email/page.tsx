import { useQuery } from "@tanstack/react-query";
import { type ColumnDef, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { MoreHorizontal, PencilLine, RadioTower } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import type { UseFormReturn } from "react-hook-form";
import { useTranslation } from "react-i18next";

import { Button } from "@arclayer/ui/button";
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  ComboboxValue,
  useComboboxAnchor,
} from "@arclayer/ui/combobox";
import { DataTablePresenter } from "@arclayer/ui/data-table";
import {
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@arclayer/ui/drawer";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuIconItem,
  DropdownMenuTrigger,
} from "@arclayer/ui/dropdown-menu";
import { Input } from "@arclayer/ui/input";
import { SettingDialogFields } from "@arclayer/ui/setting-dialog-field";
import { Switch } from "@arclayer/ui/switch";
import { useSavingKey } from "@arclayer/hooks/use-saving-key";

import { listMailProviders, sendTestEmail, switchMailProvider } from "@/api/mail";
import type { MailProviderId, MailProviderInfo } from "@/api/mail";
import {
  buildDataTableActionsColumnMeta,
  DataTableActionsCell,
} from "@/components/common/data-table-actions-cell";
import { buildDataTableToolsLabels } from "@/components/common/data-table-tools-labels";
import { BaseTag, lucideTagIcon } from "@/components/ui/tags";
import { ContentGuard } from "@/layouts/page-shell/content-guard";
import { getFieldErrorMessage } from "@/lib/forms/rhf-form-helpers";
import { ApiError } from "@/lib/http";
import { notifyError, notifyErrorText, notifySuccessText } from "@/lib/notifications";
import {
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
import {
  FieldMessage,
  OverlayBooleanField,
  OverlayField,
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
  mailEnabledTemplates: string[];
};

type ProviderTestState = {
  status: "passed" | "failed";
  message: string | null;
  testedAt: string | null;
};

type ProviderDrawerState = {
  open: boolean;
  provider: MailProviderId | null;
};

type MailProviderTableMeta = {
  activeProvider: MailProviderId;
  pendingProvider: MailProviderId | null;
  isTestingEmail: boolean;
  testStateByProvider: Partial<Record<MailProviderId, ProviderTestState>>;
  onConfigureProvider: (provider: MailProviderId) => void;
  onSetActiveProvider: (provider: MailProviderId) => void;
  t: (key: string, options?: Record<string, unknown>) => string;
};

const EMAIL_PROVIDER_OPTIONS: Array<{ value: MailProviderId; labelKey: string }> = [
  { value: "smtp", labelKey: "SETTINGS_MESSAGING_MAIL_PROVIDER_SMTP" },
  { value: "resend", labelKey: "SETTINGS_MESSAGING_MAIL_PROVIDER_RESEND" },
  { value: "cloudflare", labelKey: "SETTINGS_MESSAGING_MAIL_PROVIDER_CLOUDFLARE" },
  { value: "ses", labelKey: "SETTINGS_MESSAGING_MAIL_PROVIDER_SES" },
];
const MAIL_PROVIDER_QUERY_KEY = ["system", "mail", "providers"] as const;
const PROVIDER_FIELD_WIDTH_CLASSNAME = "w-72 max-w-full";
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

const PROVIDER_CONFIG_FIELDS: Record<MailProviderId, readonly (keyof EmailFormValues)[]> = {
  smtp: [
    "mailServer",
    "mailPort",
    "mailUsername",
    "mailPassword",
    "mailUseCredentials",
    "mailFrom",
    "mailFromName",
    "mailStarttls",
    "mailSslTls",
  ],
  resend: ["resendApiKey", "resendMailFrom", "resendMailFromName"],
  cloudflare: [
    "cloudflareApiToken",
    "cloudflareApiUrl",
    "cloudflareMailFrom",
    "cloudflareMailFromName",
  ],
  ses: ["sesRegion", "sesMailFrom", "sesMailFromName"],
};

function normalizeProvider(value: string | null): MailProviderId {
  if (value === "resend" || value === "cloudflare" || value === "ses") return value;
  return "smtp";
}

function getProviderLabel(provider: MailProviderId, t: (key: string) => string): string {
  const option = EMAIL_PROVIDER_OPTIONS.find((item) => item.value === provider);
  return option ? t(`settings:${option.labelKey}`) : provider;
}

function parseProviderList(value: string): MailProviderId[] {
  const seen = new Set<MailProviderId>();
  const providers: MailProviderId[] = [];
  for (const rawItem of value.split(/\r?\n|,/)) {
    const provider = normalizeProvider(rawItem.trim().toLowerCase());
    if (seen.has(provider)) continue;
    seen.add(provider);
    providers.push(provider);
  }
  return providers;
}

function serializeProviderList(providers: readonly MailProviderId[]): string {
  return providers.join("\n");
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
    <OverlayField label={props.label} description={props.description} message={props.message}>
      {props.children}
    </OverlayField>
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

function FallbackProvidersField(props: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  t: (key: string) => string;
}) {
  const anchor = useComboboxAnchor();
  const selectedProviders = parseProviderList(props.value);
  const providerOptions = EMAIL_PROVIDER_OPTIONS.map((option) => ({
    value: option.value,
    label: props.t(`settings:${option.labelKey}`),
  }));
  const selectedProviderOptions = providerOptions.filter((option) =>
    selectedProviders.includes(option.value),
  );

  return (
    <div className={PROVIDER_FIELD_WIDTH_CLASSNAME}>
      <Combobox
        multiple
        items={providerOptions}
        itemToStringLabel={(option) => option.label}
        itemToStringValue={(option) => option.value}
        isItemEqualToValue={(option, value) => option.value === value.value}
        value={selectedProviderOptions}
        onValueChange={(next) =>
          props.onChange(serializeProviderList(next.map((option) => option.value)))
        }
        disabled={props.disabled}
      >
        <ComboboxChips ref={anchor} className="w-full">
          {selectedProviders.map((provider) => (
            <ComboboxChip key={provider} onClick={(event) => event.stopPropagation()}>
              {getProviderLabel(provider, props.t)}
            </ComboboxChip>
          ))}
          <ComboboxValue>
            <ComboboxChipsInput
              showClear
              placeholder={
                selectedProviders.length
                  ? undefined
                  : props.t("settings:SETTINGS_MESSAGING_MAIL_FALLBACK_CHAIN_PLACEHOLDER")
              }
            />
          </ComboboxValue>
        </ComboboxChips>
        <ComboboxContent anchor={anchor}>
          <ComboboxList>
            <ComboboxEmpty>
              {props.t("settings:SETTINGS_MESSAGING_MAIL_FALLBACK_CHAIN_EMPTY")}
            </ComboboxEmpty>
            {providerOptions.map((option) => (
              <ComboboxItem key={option.value} value={option}>
                {option.label}
              </ComboboxItem>
            ))}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    </div>
  );
}

function stopEvent(event: { stopPropagation?: () => void }) {
  event.stopPropagation?.();
}

function formatProviderErrorMessage(value: string | null | undefined, t: (key: string) => string) {
  const errorKey = String(value || "").trim();
  if (!errorKey) return null;
  const localized = t(`settings:${errorKey}`);
  return localized === `settings:${errorKey}` ? errorKey : localized;
}

function formatMailActionErrorMessage(error: unknown, t: (key: string) => string) {
  const errorCode =
    error instanceof ApiError
      ? error.error || error.message
      : error instanceof Error
        ? error.message
        : "";
  const localized = formatProviderErrorMessage(errorCode, t);
  if (localized) return localized;
  return error instanceof Error ? error.message : t("settings:MAIL_SEND_FAILED");
}

function notifyProviderConfigError(error: unknown, t: (key: string) => string) {
  if (
    error instanceof Error &&
    (error.message === "RESEND_API_KEY_REQUIRED" ||
      error.message === "CLOUDFLARE_API_TOKEN_REQUIRED" ||
      error.message === "SES_REGION_REQUIRED")
  ) {
    notifyError(new Error(t(`settings:${error.message}`)));
    return;
  }
  notifyErrorText(formatMailActionErrorMessage(error, t));
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

function isProviderConfigDirty(
  provider: MailProviderId,
  values: EmailFormValues,
  initialValues: EmailFormValues,
): boolean {
  return PROVIDER_CONFIG_FIELDS[provider].some((field) => {
    if (field === "mailPassword" || field === "resendApiKey" || field === "cloudflareApiToken") {
      return Boolean(String(values[field] || "").trim());
    }
    return values[field] !== initialValues[field];
  });
}

function buildProviderPatch(
  provider: MailProviderId,
  values: EmailFormValues,
  secrets: { hasResendSecret: boolean; hasCloudflareSecret: boolean },
) {
  const providerPatch: Record<string, unknown> = {};
  if (provider === "resend") {
    if (!values.resendApiKey.trim() && !secrets.hasResendSecret) {
      throw new Error("RESEND_API_KEY_REQUIRED");
    }
    providerPatch.mail_from = values.resendMailFrom.trim() || "noreply@example.com";
    providerPatch.mail_from_name = values.resendMailFromName.trim() || "Arclayer";
    const apiKey = values.resendApiKey.trim();
    if (apiKey) providerPatch.api_key = apiKey;
  }
  if (provider === "cloudflare") {
    if (!values.cloudflareApiToken.trim() && !secrets.hasCloudflareSecret) {
      throw new Error("CLOUDFLARE_API_TOKEN_REQUIRED");
    }
    providerPatch.mail_from = values.cloudflareMailFrom.trim() || "noreply@example.com";
    providerPatch.mail_from_name = values.cloudflareMailFromName.trim() || "Arclayer";
    providerPatch.api_url =
      values.cloudflareApiUrl.trim() || "https://api.mailchannels.net/tx/v1/send";
    const apiToken = values.cloudflareApiToken.trim();
    if (apiToken) providerPatch.api_token = apiToken;
  }
  if (provider === "ses") {
    if (!values.sesRegion.trim()) {
      throw new Error("SES_REGION_REQUIRED");
    }
    providerPatch.region = values.sesRegion.trim();
    providerPatch.mail_from = values.sesMailFrom.trim() || "noreply@example.com";
    providerPatch.mail_from_name = values.sesMailFromName.trim() || "Arclayer";
  }
  return providerPatch;
}

function ProviderConfigFields(props: {
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
      <>
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
          name="mailFrom"
          render={({ field }) => (
            <FormField label={t("settings:SETTINGS_MESSAGING_MAIL_FROM")}>
              <Input {...field} value={String(field.value)} autoComplete="off" />
            </FormField>
          )}
        />
        <Controller
          control={form.control}
          name="mailFromName"
          render={({ field }) => (
            <FormField label={t("settings:SETTINGS_MESSAGING_MAIL_FROM_NAME")}>
              <Input {...field} value={String(field.value)} autoComplete="off" />
            </FormField>
          )}
        />
        <Controller
          control={form.control}
          name="mailUseCredentials"
          render={({ field }) => (
            <OverlayBooleanField
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
            <OverlayBooleanField
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
            <OverlayBooleanField
              label={t("settings:SETTINGS_MESSAGING_MAIL_SSL_TLS")}
              description={t("settings:SETTINGS_SYSTEM_EMAIL_SSL_TLS_HELP")}
              checked={Boolean(field.value)}
              onCheckedChange={field.onChange}
            />
          )}
        />
      </>
    );
  }

  if (props.provider === "resend") {
    return (
      <>
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
        <Controller
          control={form.control}
          name="resendMailFrom"
          render={({ field }) => (
            <FormField label={t("settings:SETTINGS_MESSAGING_MAIL_FROM")}>
              <Input {...field} value={String(field.value)} autoComplete="off" />
            </FormField>
          )}
        />
        <Controller
          control={form.control}
          name="resendMailFromName"
          render={({ field }) => (
            <FormField label={t("settings:SETTINGS_MESSAGING_MAIL_FROM_NAME")}>
              <Input {...field} value={String(field.value)} autoComplete="off" />
            </FormField>
          )}
        />
      </>
    );
  }

  if (props.provider === "cloudflare") {
    return (
      <>
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
        <Controller
          control={form.control}
          name="cloudflareMailFrom"
          render={({ field }) => (
            <FormField label={t("settings:SETTINGS_MESSAGING_MAIL_FROM")}>
              <Input {...field} value={String(field.value)} autoComplete="off" />
            </FormField>
          )}
        />
        <Controller
          control={form.control}
          name="cloudflareMailFromName"
          render={({ field }) => (
            <FormField label={t("settings:SETTINGS_MESSAGING_MAIL_FROM_NAME")}>
              <Input {...field} value={String(field.value)} autoComplete="off" />
            </FormField>
          )}
        />
      </>
    );
  }

  return (
    <>
      <Controller
        control={form.control}
        name="sesRegion"
        render={({ field }) => (
          <FormField label={t("settings:SETTINGS_MESSAGING_MAIL_SES_REGION")}>
            <Input {...field} placeholder="us-east-1" autoComplete="off" />
          </FormField>
        )}
      />
      <Controller
        control={form.control}
        name="sesMailFrom"
        render={({ field }) => (
          <FormField label={t("settings:SETTINGS_MESSAGING_MAIL_FROM")}>
            <Input {...field} value={String(field.value)} autoComplete="off" />
          </FormField>
        )}
      />
      <Controller
        control={form.control}
        name="sesMailFromName"
        render={({ field }) => (
          <FormField label={t("settings:SETTINGS_MESSAGING_MAIL_FROM_NAME")}>
            <Input {...field} value={String(field.value)} autoComplete="off" />
          </FormField>
        )}
      />
    </>
  );
}

function getProviderAvailabilityState(
  provider: MailProviderInfo,
  meta: MailProviderTableMeta,
): {
  label: string;
  color: React.ComponentProps<typeof BaseTag>["color"];
} {
  const testState =
    meta.testStateByProvider[provider.provider_id] ?? getProviderTestStateFromInfo(provider);
  if (!provider.configured || !provider.available) {
    return {
      label: meta.t("settings:SETTINGS_SYSTEM_EMAIL_PROVIDER_UNAVAILABLE"),
      color: "red",
    };
  }
  if (meta.isTestingEmail && (provider.active || provider.provider_id === meta.activeProvider)) {
    return {
      label: meta.t("settings:SETTINGS_SYSTEM_EMAIL_PROVIDER_TEST_PENDING"),
      color: "blue",
    };
  }
  if (testState?.status === "passed") {
    return {
      label: meta.t("settings:SETTINGS_SYSTEM_EMAIL_PROVIDER_AVAILABLE"),
      color: "green",
    };
  }
  if (testState?.status === "failed") {
    return {
      label: meta.t("settings:SETTINGS_SYSTEM_EMAIL_PROVIDER_TEST_FAILED"),
      color: "red",
    };
  }
  return {
    label: meta.t("settings:SETTINGS_SYSTEM_EMAIL_PROVIDER_CONFIGURED_NOT_TESTED"),
    color: "gold",
  };
}

function getProviderTestStateFromInfo(provider: MailProviderInfo): ProviderTestState | null {
  if (provider.last_test_status !== "passed" && provider.last_test_status !== "failed") {
    return null;
  }
  return {
    status: provider.last_test_status,
    message: provider.last_test_message ?? null,
    testedAt: provider.last_tested_at ?? null,
  };
}

function buildProviderColumns(meta: MailProviderTableMeta): ColumnDef<MailProviderInfo>[] {
  return [
    {
      id: "name",
      size: 260,
      minSize: 220,
      header: meta.t("settings:SETTINGS_SYSTEM_EMAIL_PROVIDER_TABLE_NAME"),
      cell: ({ row }) => (
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate text-callout font-semibold text-label-primary">
              {row.original.label}
            </span>
            {row.original.active || row.original.provider_id === meta.activeProvider ? (
              <BaseTag color="blue" icon={lucideTagIcon(RadioTower)} textStyle="footnote">
                {meta.t("settings:SETTINGS_MESSAGING_MAIL_PROVIDER_ACTIVE")}
              </BaseTag>
            ) : null}
          </div>
          {row.original.error ? (
            <div className="mt-1 line-clamp-2 text-footnote text-destructive">
              {formatProviderErrorMessage(row.original.error, meta.t)}
            </div>
          ) : null}
        </div>
      ),
      meta: { title: meta.t("settings:SETTINGS_SYSTEM_EMAIL_PROVIDER_TABLE_NAME") },
    },
    {
      id: "configured",
      size: 160,
      minSize: 130,
      header: meta.t("settings:SETTINGS_SYSTEM_EMAIL_PROVIDER_TABLE_CONFIGURED"),
      cell: ({ row }) => (
        <BaseTag color={row.original.configured ? "green" : "default"} textStyle="footnote">
          {row.original.configured
            ? meta.t("settings:SETTINGS_SYSTEM_CONFIGURED")
            : meta.t("settings:SETTINGS_SYSTEM_NOT_CONFIGURED")}
        </BaseTag>
      ),
      meta: { title: meta.t("settings:SETTINGS_SYSTEM_EMAIL_PROVIDER_TABLE_CONFIGURED") },
    },
    {
      id: "availability",
      size: 160,
      minSize: 130,
      header: meta.t("settings:SETTINGS_SYSTEM_EMAIL_PROVIDER_TABLE_AVAILABILITY"),
      cell: ({ row }) => {
        const availability = getProviderAvailabilityState(row.original, meta);
        return (
          <BaseTag color={availability.color} textStyle="footnote">
            {availability.label}
          </BaseTag>
        );
      },
      meta: { title: meta.t("settings:SETTINGS_SYSTEM_EMAIL_PROVIDER_TABLE_AVAILABILITY") },
    },
    {
      id: "actions",
      size: 48,
      minSize: 48,
      maxSize: 48,
      header: "",
      cell: ({ row }) => {
        const provider = row.original.provider_id;
        const isActive = row.original.active || provider === meta.activeProvider;
        const pending = meta.pendingProvider === provider;
        const canActivate = row.original.configured && row.original.available;
        return (
          <DataTableActionsCell>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label={meta.t("settings:SETTINGS_SYSTEM_EMAIL_PROVIDER_ACTIONS_LABEL")}
                  loading={pending}
                  disabled={Boolean(meta.pendingProvider)}
                  onClick={stopEvent}
                >
                  <MoreHorizontal className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" onClick={stopEvent}>
                <DropdownMenuGroup>
                  <DropdownMenuIconItem
                    icon={<RadioTower className="size-4" />}
                    disabled={isActive || !canActivate || Boolean(meta.pendingProvider)}
                    onSelect={() => meta.onSetActiveProvider(provider)}
                  >
                    {meta.t("settings:SETTINGS_SYSTEM_EMAIL_PROVIDER_SET_ACTIVE_ACTION")}
                  </DropdownMenuIconItem>
                  <DropdownMenuIconItem
                    icon={<PencilLine className="size-4" />}
                    disabled={Boolean(meta.pendingProvider)}
                    onPointerDown={() => meta.onConfigureProvider(provider)}
                    onSelect={() => meta.onConfigureProvider(provider)}
                  >
                    {meta.t("settings:SETTINGS_SYSTEM_EMAIL_PROVIDER_CONFIGURE_ACTION_SHORT")}
                  </DropdownMenuIconItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </DataTableActionsCell>
        );
      },
      meta: buildDataTableActionsColumnMeta("right", "right"),
    },
  ];
}

export function SystemSettingsEmailPage() {
  const { t } = useTranslation(["settings", "common"]);
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
  const [providerDrawer, setProviderDrawer] = useState<ProviderDrawerState>({
    open: false,
    provider: null,
  });
  const [testRecipient, setTestRecipient] = useState("");
  const [isTestingEmail, setIsTestingEmail] = useState(false);
  const [testStateByProvider, setTestStateByProvider] = useState<
    Partial<Record<MailProviderId, ProviderTestState>>
  >({});

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
  const editingProvider = providerDrawer.provider;
  const providerDrawerOpen = providerDrawer.open && editingProvider !== null;

  useEffect(() => {
    if (!coreSettingsQuery.coreSettings) return;
    if (form.formState.isDirty) return;
    form.reset(initialValues);
  }, [coreSettingsQuery.coreSettings, form, initialValues]);

  useEffect(() => {
    const providers = providersQuery.data;
    if (!providers) return;
    setTestStateByProvider((current) => {
      let changed = false;
      const next = { ...current };
      for (const provider of providers) {
        const providerTestState = getProviderTestStateFromInfo(provider);
        if (!providerTestState) continue;
        const currentState = current[provider.provider_id];
        if (
          currentState?.status === providerTestState.status &&
          currentState.message === providerTestState.message &&
          currentState.testedAt === providerTestState.testedAt
        ) {
          continue;
        }
        next[provider.provider_id] = providerTestState;
        changed = true;
      }
      return changed ? next : current;
    });
  }, [providersQuery.data]);

  const persistPatch = async (patch: Record<string, unknown>, nextValues: EmailFormValues) => {
    await patchMutation.mutateAsync(patch);
    form.reset(nextValues);
    notifySuccessText(t("settings:SETTINGS_SAVED"));
  };

  const setMailEnabled = (next: boolean) =>
    withSavingKey("mail.enabled", async () => {
      await persistPatch({ mail: { enabled: next } }, { ...form.getValues(), mailEnabled: next });
    });

  const setActiveProvider = (provider: MailProviderId) =>
    withSavingKey(`mail.provider.${provider}`, async () => {
      try {
        await switchMailProvider({ provider });
        await Promise.all([providersQuery.refetch(), coreSettingsQuery.refetch()]);
        form.reset({ ...form.getValues(), mailProvider: provider });
        notifySuccessText(
          t("settings:SETTINGS_SYSTEM_EMAIL_PROVIDER_ACTIVATED", {
            provider: getProviderLabel(provider, t),
          }),
        );
      } catch (error) {
        notifyErrorText(formatMailActionErrorMessage(error, t));
      }
    });

  const saveProviderConfig = (provider: MailProviderId) =>
    withSavingKey(`mail.${provider}.config`, async () => {
      const values = form.getValues();
      if (provider === "smtp") {
        try {
          const { patchValue, port } = buildSmtpPatch(values, t);
          await persistPatch(
            { mail: { providers: { smtp: patchValue }, ...patchValue } },
            { ...values, mailPort: String(port), mailPassword: "" },
          );
        } catch (error) {
          notifyProviderConfigError(error, t);
        }
        return;
      }

      try {
        const providerPatch = buildProviderPatch(provider, values, {
          hasResendSecret,
          hasCloudflareSecret,
        });
        await persistPatch(
          { mail: { providers: { [provider]: providerPatch } } },
          { ...values, resendApiKey: "", cloudflareApiToken: "" },
        );
        await providersQuery.refetch();
      } catch (error) {
        notifyProviderConfigError(error, t);
      }
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
      const fallbackChain = parseProviderList(values.fallbackChain);
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
          fallbackChain: serializeProviderList(fallbackChain),
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
  const providerConfigDirty = editingProvider
    ? isProviderConfigDirty(editingProvider, values, initialValues)
    : false;
  const deliveryDirty =
    values.fallbackChain !== initialValues.fallbackChain ||
    values.retryMaxAttempts !== initialValues.retryMaxAttempts ||
    values.retryBackoffSeconds !== initialValues.retryBackoffSeconds;
  const templatesDirty =
    values.mailEnabledTemplates.slice().sort().join("|") !==
    initialValues.mailEnabledTemplates.slice().sort().join("|");
  const pendingProvider =
    savingKey?.startsWith("mail.provider.") && savingKey !== "mail.provider"
      ? (savingKey.replace("mail.provider.", "") as MailProviderId)
      : null;

  const providerTableMeta = useMemo<MailProviderTableMeta>(
    () => ({
      activeProvider: mailProvider,
      pendingProvider,
      isTestingEmail,
      testStateByProvider,
      onConfigureProvider: (provider) => {
        setProviderDrawer({ open: true, provider });
      },
      onSetActiveProvider: (provider) => void setActiveProvider(provider),
      t,
    }),
    [isTestingEmail, mailProvider, pendingProvider, setActiveProvider, t, testStateByProvider],
  );
  const providerColumns = useMemo(
    () => buildProviderColumns(providerTableMeta),
    [providerTableMeta],
  );
  const providersTable = useReactTable({
    data: providersQuery.data ?? [],
    columns: providerColumns,
    getCoreRowModel: getCoreRowModel(),
    meta: providerTableMeta,
  });
  const providerColumnMenuLabels = useMemo(() => buildDataTableToolsLabels(t), [t]);

  const closeProviderDrawer = () => {
    if (editingProvider && savingKey === `mail.${editingProvider}.config`) return;
    setProviderDrawer((current) => ({ ...current, open: false }));
  };

  return (
    <>
      <ContentGuard
        loading={
          (coreSettingsQuery.isLoading && !coreSettingsQuery.coreSettings) ||
          (values.mailEnabled && providersQuery.isLoading && !providersQuery.data)
        }
        error={coreSettingsQuery.error ?? providersQuery.error}
        onRetry={() => {
          void coreSettingsQuery.refetch();
          void providersQuery.refetch();
        }}
      >
        <SystemSettingStack>
          <SystemSettingItem
            id="email-delivery"
            title={t("settings:SETTINGS_SYSTEM_EMAIL_DELIVERY_SECTION_TITLE")}
            description={t("settings:SETTINGS_SYSTEM_EMAIL_DELIVERY_SECTION_DESC")}
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

          {values.mailEnabled ? (
            <>
              <SystemSettingItem
                id="active-provider"
                title={t("settings:SETTINGS_SYSTEM_EMAIL_PROVIDERS_TITLE")}
                description={t("settings:SETTINGS_SYSTEM_EMAIL_PROVIDERS_DESC")}
              >
                <DataTablePresenter
                  table={providersTable}
                  emptyText={t("settings:SETTINGS_SYSTEM_EMAIL_PROVIDERS_EMPTY")}
                  className="min-w-0 max-w-full overflow-hidden"
                  surface="embedded"
                  rowHeight="tall"
                  wrapContent
                  columnMenuLabels={providerColumnMenuLabels}
                />
              </SystemSettingItem>

              <SystemSettingItem
                id="test-email"
                title={t("settings:SETTINGS_MESSAGING_MAIL_TEST_TITLE")}
                description={t("settings:SETTINGS_MESSAGING_MAIL_TEST_DESC")}
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
                    disabled={!testRecipient.trim()}
                    onClick={() => {
                      const recipient = testRecipient.trim();
                      if (!recipient) return;
                      setIsTestingEmail(true);
                      sendTestEmail({ recipient })
                        .then((result) => {
                          const provider = normalizeProvider(result.provider ?? mailProvider);
                          setTestStateByProvider((current) => ({
                            ...current,
                            [provider]: {
                              status: "passed",
                              message: null,
                              testedAt: new Date().toISOString(),
                            },
                          }));
                          notifySuccessText(t("settings:SETTINGS_MESSAGING_MAIL_TEST_SUCCESS"));
                        })
                        .catch((error) => {
                          setTestStateByProvider((current) => ({
                            ...current,
                            [mailProvider]: {
                              status: "failed",
                              message: error instanceof Error ? error.message : null,
                              testedAt: new Date().toISOString(),
                            },
                          }));
                          notifyError(error);
                        })
                        .finally(() => setIsTestingEmail(false));
                    }}
                  >
                    {t("settings:SETTINGS_MESSAGING_MAIL_TEST_ACTION")}
                  </Button>
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
                <div className="grid gap-2">
                  <Controller
                    control={form.control}
                    name="fallbackChain"
                    render={({ field }) => (
                      <SystemSettingRow
                        title={t("settings:SETTINGS_MESSAGING_MAIL_FALLBACK_CHAIN")}
                        description={t("settings:SETTINGS_MESSAGING_MAIL_FALLBACK_CHAIN_DESC")}
                        control={
                          <div className="flex flex-col gap-2">
                            <FallbackProvidersField
                              value={field.value}
                              onChange={(next) => field.onChange(next)}
                              t={t}
                            />
                          </div>
                        }
                      />
                    )}
                  />
                  <Controller
                    control={form.control}
                    name="retryMaxAttempts"
                    render={({ field }) => (
                      <SystemSettingRow
                        title={t("settings:SETTINGS_MESSAGING_MAIL_RETRY_MAX_ATTEMPTS")}
                        control={
                          <Input
                            {...field}
                            className={PROVIDER_FIELD_WIDTH_CLASSNAME}
                            type="number"
                            inputMode="numeric"
                          />
                        }
                      >
                        <FieldMessage message={getFieldErrorMessage(form, "retryMaxAttempts")} />
                      </SystemSettingRow>
                    )}
                  />
                  <Controller
                    control={form.control}
                    name="retryBackoffSeconds"
                    render={({ field }) => (
                      <SystemSettingRow
                        title={t("settings:SETTINGS_MESSAGING_MAIL_RETRY_BACKOFF")}
                        description={t("settings:SETTINGS_MESSAGING_MAIL_RETRY_BACKOFF_DESC")}
                        control={
                          <Input
                            {...field}
                            className={PROVIDER_FIELD_WIDTH_CLASSNAME}
                            autoComplete="off"
                          />
                        }
                      />
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
                <div className="grid gap-2">
                  {TEMPLATE_OPTIONS.map((template) => {
                    const checked = values.mailEnabledTemplates.includes(template.key);
                    return (
                      <SystemSettingRow
                        key={template.key}
                        title={t(template.titleKey)}
                        description={t(template.descriptionKey)}
                        control={
                          <Switch
                            checked={checked}
                            onCheckedChange={(next) => {
                              const current = form.getValues("mailEnabledTemplates") || [];
                              const nextTemplates = next
                                ? [...current, template.key]
                                : current.filter((item) => item !== template.key);
                              form.setValue(
                                "mailEnabledTemplates",
                                Array.from(new Set(nextTemplates)),
                                { shouldDirty: true },
                              );
                            }}
                          />
                        }
                      />
                    );
                  })}
                </div>
              </SystemSettingItem>
            </>
          ) : null}
        </SystemSettingStack>
      </ContentGuard>

      <Drawer
        open={providerDrawerOpen}
        onOpenChange={(open) => {
          if (!open) closeProviderDrawer();
        }}
        direction="right"
      >
        <DrawerContent className="w-full sm:max-w-xl">
          <DrawerHeader className="min-w-0 rounded-none px-6 py-5 pr-14 text-left md:max-w-none">
            <DrawerTitle className="text-title3 font-semibold text-label-primary">
              {editingProvider
                ? t("settings:SETTINGS_SYSTEM_EMAIL_PROVIDER_CONFIG_DIALOG_TITLE", {
                    provider: getProviderLabel(editingProvider, t),
                  })
                : t("settings:SETTINGS_SYSTEM_EMAIL_PROVIDER_CONFIGURE_ACTION")}
            </DrawerTitle>
            <DrawerDescription className="mb-0 text-body text-label-secondary">
              {t("settings:SETTINGS_SYSTEM_EMAIL_PROVIDER_CONFIG_DIALOG_DESC")}
            </DrawerDescription>
          </DrawerHeader>
          <DrawerBody className="min-h-0 flex-1 overflow-auto md:max-w-none">
            <SettingDialogFields>
              {editingProvider ? (
                <ProviderConfigFields
                  provider={editingProvider}
                  form={form}
                  hasMailPasswordSecret={hasMailPasswordSecret}
                  hasResendSecret={hasResendSecret}
                  hasCloudflareSecret={hasCloudflareSecret}
                  t={t}
                />
              ) : null}
            </SettingDialogFields>
          </DrawerBody>
          <DrawerFooter className="md:max-w-none">
            <div className="flex w-full items-center justify-end gap-2">
              <Button
                variant="outline"
                disabled={editingProvider ? savingKey === `mail.${editingProvider}.config` : false}
                onClick={closeProviderDrawer}
              >
                {t("common:CANCEL")}
              </Button>
              {editingProvider ? (
                <Button
                  loading={savingKey === `mail.${editingProvider}.config`}
                  disabled={!providerConfigDirty || savingKey === `mail.${editingProvider}.config`}
                  onClick={() => void saveProviderConfig(editingProvider)}
                >
                  {t("settings:SETTINGS_SAVE")}
                </Button>
              ) : null}
            </div>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </>
  );
}
