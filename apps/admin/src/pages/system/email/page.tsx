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
import { listSystemPlugins, SYSTEM_PLUGINS_QUERY_KEY } from "@/api/plugins";
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
import { EmailTemplateManager } from "@/pages/system/email/email-template-manager";
import {
  findEmailProviderDefinition,
  resolveEmailProviderDefinitions,
  type EmailProviderDefinition,
} from "@/pages/system/email/email-provider-definitions";
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
  providerConfig: Record<string, Record<string, string>>;
  fallbackChain: string;
  retryMaxAttempts: string;
  retryBackoffSeconds: string;
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

const MAIL_PROVIDER_QUERY_KEY = ["system", "mail", "providers"] as const;
const PROVIDER_FIELD_WIDTH_CLASSNAME = "w-72 max-w-full";

function normalizeProvider(value: string | null): MailProviderId {
  return value?.trim().toLowerCase() || "smtp";
}

function getProviderLabel(
  provider: MailProviderId,
  definitions: readonly EmailProviderDefinition[],
  t: (key: string) => string,
): string {
  const definition = findEmailProviderDefinition(definitions, provider);
  return definition ? t(definition.labelKey) : provider;
}

function parseProviderList(value: string): MailProviderId[] {
  const seen = new Set<MailProviderId>();
  const providers: MailProviderId[] = [];
  for (const rawItem of value.split(/\r?\n|,/)) {
    const normalized = rawItem.trim().toLowerCase();
    if (!normalized) continue;
    const provider = normalizeProvider(normalized);
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
  definitions: readonly EmailProviderDefinition[],
): EmailFormValues {
  const mail = getSystemSettingsSection(input, "mail");
  const providers = readRecordValue(mail, "providers");
  const smtp = readRecordValue(providers, "smtp");
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
    providerConfig: Object.fromEntries(
      definitions
        .filter((definition) => !definition.builtIn)
        .map((definition) => {
          const provider = readRecordValue(providers, definition.providerId);
          return [
            definition.providerId,
            Object.fromEntries(
              definition.fields.map((field) => [
                field.name,
                field.secret ? "" : (readStringValue(provider, field.name) ?? field.defaultValue),
              ]),
            ),
          ];
        }),
    ),
    fallbackChain: Array.isArray(fallbackChain)
      ? fallbackChain.filter((item): item is string => typeof item === "string").join("\n")
      : "",
    retryMaxAttempts: String(readNumberValue(retry, "max_attempts") ?? 3),
    retryBackoffSeconds: Array.isArray(retryBackoff)
      ? retryBackoff.filter((item): item is number => typeof item === "number").join(", ")
      : "1, 2, 4",
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
  definitions: readonly EmailProviderDefinition[];
  disabled?: boolean;
  t: (key: string) => string;
}) {
  const anchor = useComboboxAnchor();
  const selectedProviders = parseProviderList(props.value);
  const providerOptions = props.definitions.map((definition) => ({
    value: definition.providerId,
    label: props.t(definition.labelKey),
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
              {getProviderLabel(provider, props.definitions, props.t)}
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
  definition: EmailProviderDefinition,
  values: EmailFormValues,
  initialValues: EmailFormValues,
): boolean {
  if (definition.builtIn) {
    return (
      values.mailServer !== initialValues.mailServer ||
      values.mailPort !== initialValues.mailPort ||
      values.mailUsername !== initialValues.mailUsername ||
      Boolean(values.mailPassword.trim()) ||
      values.mailUseCredentials !== initialValues.mailUseCredentials ||
      values.mailFrom !== initialValues.mailFrom ||
      values.mailFromName !== initialValues.mailFromName ||
      values.mailStarttls !== initialValues.mailStarttls ||
      values.mailSslTls !== initialValues.mailSslTls
    );
  }
  const current = values.providerConfig[definition.providerId] ?? {};
  const initial = initialValues.providerConfig[definition.providerId] ?? {};
  return definition.fields.some((field) =>
    field.secret
      ? Boolean(current[field.name]?.trim())
      : current[field.name] !== initial[field.name],
  );
}

function buildProviderPatch(
  definition: EmailProviderDefinition,
  values: EmailFormValues,
  secretStates: Readonly<Record<string, boolean>>,
  t: (key: string, options?: Record<string, unknown>) => string,
) {
  const providerPatch: Record<string, unknown> = {};
  const providerValues = values.providerConfig[definition.providerId] ?? {};
  for (const field of definition.fields) {
    const value = String(providerValues[field.name] ?? "").trim();
    const hasStoredSecret = secretStates[`${definition.providerId}.${field.name}`] === true;
    if (field.required && !value && !(field.secret && hasStoredSecret)) {
      throw new Error(
        t("settings:SETTINGS_SYSTEM_EMAIL_PROVIDER_REQUIRED_FIELD", {
          field: t(field.labelKey),
        }),
      );
    }
    if (field.secret && !value) continue;
    providerPatch[field.name] = value || field.defaultValue || null;
  }
  return providerPatch;
}

function ProviderConfigFields(props: {
  definition: EmailProviderDefinition;
  form: UseFormReturn<EmailFormValues>;
  hasMailPasswordSecret: boolean;
  secretStates: Readonly<Record<string, boolean>>;
  t: (key: string) => string;
}) {
  const { form, t } = props;
  if (props.definition.builtIn) {
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

  return (
    <>
      {props.definition.fields.map((providerField) => {
        const name = `providerConfig.${props.definition.providerId}.${providerField.name}` as const;
        const hasStoredSecret =
          props.secretStates[`${props.definition.providerId}.${providerField.name}`] === true;
        return (
          <Controller
            key={providerField.name}
            control={form.control}
            name={name}
            render={({ field }) => (
              <FormField
                label={t(providerField.labelKey)}
                description={
                  providerField.secret
                    ? t(
                        hasStoredSecret
                          ? "settings:SETTINGS_MESSAGING_MAIL_PROVIDER_SECRET_SET"
                          : "settings:SETTINGS_MESSAGING_MAIL_PROVIDER_SECRET_NOT_SET",
                      )
                    : providerField.descriptionKey
                      ? t(providerField.descriptionKey)
                      : undefined
                }
              >
                <Input
                  {...field}
                  value={String(field.value ?? "")}
                  type={
                    providerField.secret
                      ? "password"
                      : providerField.format === "email"
                        ? "email"
                        : "text"
                  }
                  autoComplete={providerField.secret ? "new-password" : "off"}
                  placeholder={providerField.placeholder ?? undefined}
                />
              </FormField>
            )}
          />
        );
      })}
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
  const pluginsQuery = useQuery({
    queryKey: SYSTEM_PLUGINS_QUERY_KEY,
    queryFn: ({ signal }) => listSystemPlugins(signal),
    retry: false,
  });
  const providerDefinitions = useMemo(
    () => resolveEmailProviderDefinitions(pluginsQuery.data ?? []),
    [pluginsQuery.data],
  );
  const secrets = getSystemSettingsSecrets(coreSettingsQuery.coreSettings);
  const hasMailPasswordSecret = Boolean(secrets["mail.password"]);
  const providerSecretStates = useMemo(
    () =>
      Object.fromEntries(
        providerDefinitions.flatMap((definition) =>
          definition.fields
            .filter((field) => field.secret)
            .map((field) => [
              `${definition.providerId}.${field.name}`,
              Boolean(secrets[`mail.providers.${definition.providerId}.${field.name}`]),
            ]),
        ),
      ) as Record<string, boolean>,
    [providerDefinitions, secrets],
  );
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
    () => buildInitialValues(coreSettingsQuery.coreSettings, providerDefinitions),
    [coreSettingsQuery.coreSettings, providerDefinitions],
  );

  const form = useForm<EmailFormValues>({
    defaultValues: initialValues,
    mode: "onSubmit",
  });
  const values = form.watch();
  const mailProvider = values.mailProvider;
  const editingProvider = providerDrawer.provider;
  const editingDefinition = editingProvider
    ? findEmailProviderDefinition(providerDefinitions, editingProvider)
    : null;
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
            provider: getProviderLabel(provider, providerDefinitions, t),
          }),
        );
      } catch (error) {
        notifyErrorText(formatMailActionErrorMessage(error, t));
      }
    });

  const saveProviderConfig = (provider: MailProviderId) =>
    withSavingKey(`mail.${provider}.config`, async () => {
      const values = form.getValues();
      const definition = findEmailProviderDefinition(providerDefinitions, provider);
      if (!definition) {
        notifyErrorText(t("settings:SETTINGS_SYSTEM_EMAIL_PROVIDER_DEFINITION_MISSING"));
        return;
      }
      if (definition.builtIn) {
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
        const providerPatch = buildProviderPatch(definition, values, providerSecretStates, t);
        const nextProviderConfig = {
          ...values.providerConfig[provider],
          ...Object.fromEntries(
            definition.fields.filter((field) => field.secret).map((field) => [field.name, ""]),
          ),
        };
        await persistPatch(
          { mail: { providers: { [provider]: providerPatch } } },
          {
            ...values,
            providerConfig: { ...values.providerConfig, [provider]: nextProviderConfig },
          },
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

  const enabledDirty = values.mailEnabled !== initialValues.mailEnabled;
  const providerConfigDirty = editingDefinition
    ? isProviderConfigDirty(editingDefinition, values, initialValues)
    : false;
  const deliveryDirty =
    values.fallbackChain !== initialValues.fallbackChain ||
    values.retryMaxAttempts !== initialValues.retryMaxAttempts ||
    values.retryBackoffSeconds !== initialValues.retryBackoffSeconds;
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
          (values.mailEnabled &&
            ((providersQuery.isLoading && !providersQuery.data) || pluginsQuery.isLoading))
        }
        error={
          coreSettingsQuery.error ??
          (values.mailEnabled ? (providersQuery.error ?? pluginsQuery.error) : null)
        }
        onRetry={() => {
          void coreSettingsQuery.refetch();
          void providersQuery.refetch();
          void pluginsQuery.refetch();
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

          <EmailTemplateManager />

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
                              definitions={providerDefinitions}
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
                    provider: getProviderLabel(editingProvider, providerDefinitions, t),
                  })
                : t("settings:SETTINGS_SYSTEM_EMAIL_PROVIDER_CONFIGURE_ACTION")}
            </DrawerTitle>
            <DrawerDescription className="mb-0 text-body text-label-secondary">
              {t("settings:SETTINGS_SYSTEM_EMAIL_PROVIDER_CONFIG_DIALOG_DESC")}
            </DrawerDescription>
          </DrawerHeader>
          <DrawerBody className="min-h-0 flex-1 overflow-auto md:max-w-none">
            <SettingDialogFields>
              {editingDefinition ? (
                <ProviderConfigFields
                  definition={editingDefinition}
                  form={form}
                  hasMailPasswordSecret={hasMailPasswordSecret}
                  secretStates={providerSecretStates}
                  t={t}
                />
              ) : editingProvider ? (
                <div className="text-body text-destructive">
                  {t("settings:SETTINGS_SYSTEM_EMAIL_PROVIDER_DEFINITION_MISSING")}
                </div>
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
