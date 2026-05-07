import { useEffect, useMemo } from "react";
import { Controller, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";

import { Input } from "@arclayer/ui/input";
import { Switch } from "@arclayer/ui/switch";
import { useSavingKey } from "@arclayer/hooks/use-saving-key";

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
import {
  FieldMessage,
  formatSummaryText,
  normalizeOptionalString,
} from "@/pages/system/system-settings-form-utils";

const OAUTH_PROVIDERS = [
  {
    key: "google",
    sectionKey: "oauth_google",
    titleKey: "settings:SETTINGS_SYSTEM_OAUTH_GOOGLE_TITLE",
  },
  {
    key: "github",
    sectionKey: "oauth_github",
    titleKey: "settings:SETTINGS_SYSTEM_OAUTH_GITHUB_TITLE",
  },
  {
    key: "microsoft",
    sectionKey: "oauth_microsoft",
    titleKey: "settings:SETTINGS_SYSTEM_OAUTH_MICROSOFT_TITLE",
  },
  {
    key: "discord",
    sectionKey: "oauth_discord",
    titleKey: "settings:SETTINGS_SYSTEM_OAUTH_DISCORD_TITLE",
  },
] as const;

type OAuthProvider = (typeof OAUTH_PROVIDERS)[number];
type OAuthProviderKey = OAuthProvider["key"];

type OAuthFormValues = {
  providers: Record<
    OAuthProviderKey,
    {
      enabled: boolean;
      clientId: string;
      clientSecret: string;
    }
  >;
};

function buildInitialValues(
  input: ReturnType<typeof useSystemCoreSettings>["coreSettings"],
): OAuthFormValues {
  return {
    providers: Object.fromEntries(
      OAUTH_PROVIDERS.map((provider) => {
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
  const patchMutation = usePatchSystemCoreSettings();
  const secrets = getSystemSettingsSecrets(coreSettingsQuery.coreSettings);
  const secretStates = useMemo(
    () =>
      Object.fromEntries(
        OAUTH_PROVIDERS.map((provider) => [
          provider.key,
          Boolean(secrets[`${provider.sectionKey}.client_secret`]),
        ]),
      ) as Record<OAuthProviderKey, boolean>,
    [secrets],
  );

  const initialValues = useMemo(
    () => buildInitialValues(coreSettingsQuery.coreSettings),
    [coreSettingsQuery.coreSettings],
  );

  const form = useForm<OAuthFormValues>({
    defaultValues: initialValues,
    mode: "onSubmit",
  });
  const values = form.watch();

  useEffect(() => {
    if (!coreSettingsQuery.coreSettings) return;
    if (form.formState.isDirty) return;
    form.reset(initialValues);
  }, [coreSettingsQuery.coreSettings, form, initialValues]);

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
      loading={coreSettingsQuery.isLoading && !coreSettingsQuery.coreSettings}
      error={coreSettingsQuery.error}
      onRetry={() => void coreSettingsQuery.refetch()}
    >
      <SystemSettingStack>
        {OAUTH_PROVIDERS.map((provider) => {
          const providerValues = values.providers[provider.key];
          const initialProviderValues = initialValues.providers[provider.key];
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
                <div className="text-footnote text-label-secondary">
                  {formatSummaryText(
                    providerValues.clientId,
                    t("settings:SETTINGS_SYSTEM_NOT_CONFIGURED"),
                  )}
                </div>
              </div>
            </SystemSettingItem>
          );
        })}
      </SystemSettingStack>
    </ContentGuard>
  );
}
