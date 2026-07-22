import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Controller, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";

import { Input } from "@arclayer/ui/input";
import { Switch } from "@arclayer/ui/switch";
import { useSavingKey } from "@arclayer/hooks/use-saving-key";

import {
  listSystemPlugins,
  SYSTEM_PLUGINS_QUERY_KEY,
  type SystemConnectorDefinition,
  type SystemPlugin,
} from "@/api/plugins";
import { ContentGuard } from "@/layouts/page-shell/content-guard";
import { getFieldErrorMessage, validateFormFields } from "@/lib/forms/rhf-form-helpers";
import { notifySuccessText } from "@/lib/notifications";
import {
  SystemSettingFooterActions,
  SystemSettingField,
  SystemSettingItem,
  SystemSettingRow,
  SystemSettingStack,
} from "@/pages/system/components/system-setting-item";
import {
  getSystemSettingsSection,
  getSystemSettingsSecrets,
  readBooleanValue,
  readStringValue,
  usePatchSystemCoreSettings,
  useSystemCoreSettings,
} from "@/pages/system/hooks/use-system-core-settings";
import { FieldMessage, normalizeOptionalString } from "@/pages/system/system-settings-form-utils";

type OAuthProvider = {
  key: string;
  sectionKey: string;
  titleKey: string;
};

type OAuthFormValues = {
  providers: Record<
    string,
    {
      enabled: boolean;
      clientId: string;
      clientSecret: string;
    }
  >;
};

function buildInitialValues(
  input: ReturnType<typeof useSystemCoreSettings>["coreSettings"],
  providers: readonly OAuthProvider[],
): OAuthFormValues {
  return {
    providers: Object.fromEntries(
      providers.map((provider) => {
        const section = getSystemSettingsSection(input, provider.sectionKey);
        return [
          provider.key,
          {
            enabled: Boolean(readBooleanValue(section, "enabled")),
            clientId: readStringValue(section, "client_id") ?? "",
            clientSecret: "",
          },
        ];
      }),
    ) as OAuthFormValues["providers"],
  };
}

function toOAuthProvider(definition: SystemConnectorDefinition): OAuthProvider | null {
  const admin = definition.admin;
  if (definition.kind !== "oauth" || !definition.key.startsWith("oauth.")) return null;
  if (!admin?.settingsSection) return null;
  return {
    key: definition.key.slice("oauth.".length),
    sectionKey: admin.settingsSection,
    titleKey: admin.labelKey,
  };
}

function resolveOAuthProviders(plugins: readonly SystemPlugin[]): OAuthProvider[] {
  return plugins.flatMap((plugin) =>
    plugin.connectorDefinitions.flatMap((definition) => {
      const provider = toOAuthProvider(definition);
      return provider ? [provider] : [];
    }),
  );
}

function ProviderField(props: {
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

export function SystemSettingsOAuthPage() {
  const { t } = useTranslation(["settings"]);
  const { savingKey, withSavingKey } = useSavingKey();
  const coreSettingsQuery = useSystemCoreSettings();
  const pluginsQuery = useQuery({
    queryKey: SYSTEM_PLUGINS_QUERY_KEY,
    queryFn: ({ signal }) => listSystemPlugins(signal),
    retry: false,
  });
  const providers = useMemo(
    () => resolveOAuthProviders(pluginsQuery.data ?? []),
    [pluginsQuery.data],
  );
  const patchMutation = usePatchSystemCoreSettings();
  const secrets = getSystemSettingsSecrets(coreSettingsQuery.coreSettings);
  const secretStates = useMemo(
    () =>
      Object.fromEntries(
        providers.map((provider) => [
          provider.key,
          Boolean(secrets[`${provider.sectionKey}.client_secret`]),
        ]),
      ) as Record<string, boolean>,
    [providers, secrets],
  );

  const initialValues = useMemo(
    () => buildInitialValues(coreSettingsQuery.coreSettings, providers),
    [coreSettingsQuery.coreSettings, providers],
  );

  const form = useForm<OAuthFormValues>({
    defaultValues: initialValues,
    mode: "onSubmit",
  });
  const values = form.watch();

  useEffect(() => {
    if (!coreSettingsQuery.coreSettings || pluginsQuery.isLoading) return;
    if (form.formState.isDirty) return;
    form.reset(initialValues);
  }, [coreSettingsQuery.coreSettings, form, initialValues, pluginsQuery.isLoading]);

  const persistPatch = async (patch: Record<string, unknown>, nextValues: OAuthFormValues) => {
    await patchMutation.mutateAsync(patch);
    form.reset(nextValues);
    notifySuccessText(t("settings:SETTINGS_SAVED"));
  };

  const saveProvider = (provider: OAuthProvider) =>
    withSavingKey(`oauth.${provider.key}`, async () => {
      const enabledName = `providers.${provider.key}.enabled` as const;
      const clientIdName = `providers.${provider.key}.clientId` as const;
      const clientSecretName = `providers.${provider.key}.clientSecret` as const;
      const hasSecret = secretStates[provider.key];
      const next = await validateFormFields(form, [enabledName, clientIdName, clientSecretName]);
      const providerValues = next.providers[provider.key];
      const enabled = Boolean(providerValues.enabled);
      const clientId = String(providerValues.clientId || "").trim();
      const clientSecret = String(providerValues.clientSecret || "").trim();

      if (enabled && !clientId) {
        form.setError(clientIdName, {
          type: "validate",
          message: t("settings:SETTINGS_VALIDATION_REQUIRED"),
        });
        throw new Error("FORM_VALIDATION_FAILED");
      }
      if (enabled && !clientSecret && !hasSecret) {
        form.setError(clientSecretName, {
          type: "validate",
          message: t("settings:SETTINGS_VALIDATION_REQUIRED"),
        });
        throw new Error("FORM_VALIDATION_FAILED");
      }

      const patchValue: Record<string, unknown> = {
        enabled,
        client_id: normalizeOptionalString(clientId),
      };
      if (clientSecret) {
        patchValue.client_secret = clientSecret;
      }

      await persistPatch(
        { [provider.sectionKey]: patchValue },
        {
          ...form.getValues(),
          providers: {
            ...form.getValues().providers,
            [provider.key]: {
              enabled,
              clientId,
              clientSecret: "",
            },
          },
        },
      );
    });

  return (
    <ContentGuard
      loading={
        (coreSettingsQuery.isLoading && !coreSettingsQuery.coreSettings) || pluginsQuery.isLoading
      }
      error={coreSettingsQuery.error ?? pluginsQuery.error}
      onRetry={() => {
        void coreSettingsQuery.refetch();
        void pluginsQuery.refetch();
      }}
      empty={providers.length === 0}
      emptyTitle={t("settings:SETTINGS_SYSTEM_OAUTH_EMPTY_TITLE")}
      emptyDescription={t("settings:SETTINGS_SYSTEM_OAUTH_EMPTY_DESC")}
    >
      <SystemSettingStack>
        {providers.map((provider) => {
          const initialProviderValues = initialValues.providers[provider.key];
          const providerValues = values.providers[provider.key] ?? initialProviderValues;
          const enabledName = `providers.${provider.key}.enabled` as const;
          const clientIdName = `providers.${provider.key}.clientId` as const;
          const clientSecretName = `providers.${provider.key}.clientSecret` as const;
          const hasSecret = secretStates[provider.key];
          const dirty =
            providerValues.enabled !== initialProviderValues.enabled ||
            providerValues.clientId !== initialProviderValues.clientId ||
            Boolean(providerValues.clientSecret.trim());
          const clientIdError = getFieldErrorMessage(form, clientIdName);
          const clientSecretError = getFieldErrorMessage(form, clientSecretName);

          return (
            <SystemSettingItem
              key={provider.key}
              id={provider.key}
              title={t(provider.titleKey)}
              description={t("settings:SETTINGS_SYSTEM_OAUTH_PROVIDER_DIALOG_DESC")}
              footer={
                <SystemSettingFooterActions
                  dirty={dirty}
                  pending={savingKey === `oauth.${provider.key}` || patchMutation.isPending}
                  onReset={() =>
                    form.reset({
                      ...form.getValues(),
                      providers: {
                        ...form.getValues().providers,
                        [provider.key]: initialProviderValues,
                      },
                    })
                  }
                  onSave={() => void saveProvider(provider)}
                />
              }
            >
              <div className="grid gap-3">
                <Controller
                  control={form.control}
                  name={enabledName}
                  render={({ field }) => (
                    <SystemSettingRow
                      title={t("settings:SETTINGS_SYSTEM_OAUTH_PROVIDER_ENABLED_TITLE")}
                      description={t("settings:SETTINGS_SYSTEM_OAUTH_PROVIDER_ENABLED_DESC")}
                      control={
                        <Switch checked={Boolean(field.value)} onCheckedChange={field.onChange} />
                      }
                    />
                  )}
                />
                <Controller
                  control={form.control}
                  name={clientIdName}
                  render={({ field }) => (
                    <ProviderField
                      label={t("settings:SETTINGS_SYSTEM_OAUTH_CLIENT_ID_LABEL")}
                      message={clientIdError}
                    >
                      <Input {...field} autoComplete="off" />
                    </ProviderField>
                  )}
                />
                <Controller
                  control={form.control}
                  name={clientSecretName}
                  render={({ field }) => (
                    <ProviderField
                      label={t("settings:SETTINGS_SYSTEM_OAUTH_CLIENT_SECRET_LABEL")}
                      description={
                        hasSecret
                          ? t("settings:SETTINGS_SYSTEM_OAUTH_SECRET_SET_HINT")
                          : t("settings:SETTINGS_SYSTEM_OAUTH_SECRET_EMPTY_HINT")
                      }
                      message={clientSecretError}
                    >
                      <Input
                        {...field}
                        type="password"
                        autoComplete="new-password"
                        placeholder={t("settings:SETTINGS_MESSAGING_MAIL_PASSWORD_PLACEHOLDER")}
                      />
                    </ProviderField>
                  )}
                />
              </div>
            </SystemSettingItem>
          );
        })}
      </SystemSettingStack>
    </ContentGuard>
  );
}
