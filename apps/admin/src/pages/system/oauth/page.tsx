import { useEffect, useMemo } from "react";
import { Controller, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Input } from "@arclayer/ui/input";
import { SettingActionGroup } from "@arclayer/ui/setting-action-group";
import { SettingActionItem } from "@arclayer/ui/setting-action-item";
import { SettingDialogFields } from "@arclayer/ui/setting-dialog-field";
import { SettingOverlayFooter } from "@arclayer/ui/setting-overlay-footer";
import { SettingPanel } from "@arclayer/ui/setting-panel";
import { useSavingKey } from "@arclayer/hooks/use-saving-key";

import { ContentGuard } from "@/layouts/page-shell/content-guard";
import { getFieldErrorMessage, validateFormFields } from "@/lib/forms/rhf-form-helpers";
import { notifySuccessText } from "@/lib/notifications";
import { type SettingOverlayConfig, useSettingOverlays } from "@/hooks/use-setting-overlays";
import {
  getSystemSettingsSection,
  getSystemSettingsSecrets,
  readBooleanValue,
  readStringValue,
  usePatchSystemCoreSettings,
  useSystemCoreSettings,
} from "@/pages/system/hooks/use-system-core-settings";
import {
  OverlayField,
  OverlayBooleanField,
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

type OAuthProviderKey = (typeof OAUTH_PROVIDERS)[number]["key"];

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

type OAuthOverlayKey = OAuthProviderKey;

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

function formatProviderSummary(enabled: boolean, configured: boolean, t: (key: string) => string) {
  if (!enabled) return t("settings:SETTINGS_DISABLED");
  return configured
    ? t("settings:SETTINGS_SYSTEM_CONFIGURED")
    : t("settings:SETTINGS_SYSTEM_INCOMPLETE");
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

  const saveProvider = (providerKey: OAuthProviderKey) =>
    withSavingKey(`oauth.${providerKey}`, async () => {
      const provider = OAUTH_PROVIDERS.find((item) => item.key === providerKey);
      if (!provider) return;
      const enabledName = `providers.${providerKey}.enabled` as const;
      const clientIdName = `providers.${providerKey}.clientId` as const;
      const clientSecretName = `providers.${providerKey}.clientSecret` as const;
      const hasSecret = secretStates[providerKey];
      const values = await validateFormFields(form, [enabledName, clientIdName, clientSecretName]);
      const providerValues = values.providers[providerKey];
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
            [providerKey]: {
              enabled,
              clientId,
              clientSecret: "",
            },
          },
        },
      );
    });

  const overlayConfigs = useMemo<readonly SettingOverlayConfig<OAuthOverlayKey>[]>(() => {
    return OAUTH_PROVIDERS.map((provider) => {
      const enabledName = `providers.${provider.key}.enabled` as const;
      const clientIdName = `providers.${provider.key}.clientId` as const;
      const clientSecretName = `providers.${provider.key}.clientSecret` as const;
      const clientIdError = getFieldErrorMessage(form, clientIdName);
      const clientSecretError = getFieldErrorMessage(form, clientSecretName);
      const hasSecret = secretStates[provider.key];

      return {
        key: provider.key,
        type: "dialog",
        title: t(provider.titleKey),
        description: t("settings:SETTINGS_SYSTEM_OAUTH_PROVIDER_DIALOG_DESC"),
        footer: (ctx) => (
          <SettingOverlayFooter
            close={ctx.close}
            backText={t("common:CANCEL")}
            saveText={t("settings:SETTINGS_SAVE")}
            saveLoading={savingKey === `oauth.${provider.key}`}
            disabled={patchMutation.isPending}
            onSave={() => saveProvider(provider.key)}
          />
        ),
        content: () => (
          <SettingDialogFields>
            <Controller
              control={form.control}
              name={enabledName}
              render={({ field }) => (
                <OverlayBooleanField
                  label={t("settings:SETTINGS_SYSTEM_OAUTH_PROVIDER_ENABLED_TITLE")}
                  description={t("settings:SETTINGS_SYSTEM_OAUTH_PROVIDER_ENABLED_DESC")}
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
              name={clientIdName}
              render={({ field }) => (
                <OverlayField
                  label={t("settings:SETTINGS_SYSTEM_OAUTH_CLIENT_ID_LABEL")}
                  message={clientIdError}
                >
                  <Input {...field} autoComplete="off" />
                </OverlayField>
              )}
            />
            <Controller
              control={form.control}
              name={clientSecretName}
              render={({ field }) => (
                <OverlayField
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
                </OverlayField>
              )}
            />
          </SettingDialogFields>
        ),
      };
    });
  }, [form, patchMutation.isPending, saveProvider, savingKey, secretStates, t]);

  const overlays = useSettingOverlays(overlayConfigs);
  const openOverlay = (key: OAuthOverlayKey) => {
    form.reset(initialValues);
    overlays.open(key);
  };
  const providerState = (provider: (typeof OAUTH_PROVIDERS)[number]) => {
    const values = initialValues.providers[provider.key];
    return {
      enabled: values.enabled,
      clientId: values.clientId,
      configured: Boolean(values.clientId.trim() && secretStates[provider.key]),
    };
  };

  return (
    <ContentGuard
      loading={coreSettingsQuery.isLoading && !coreSettingsQuery.coreSettings}
      error={coreSettingsQuery.error}
      onRetry={() => void coreSettingsQuery.refetch()}
    >
      <SettingPanel
        title={t("settings:SETTINGS_SYSTEM_OAUTH_PAGE_TITLE")}
        description={t("settings:SETTINGS_SYSTEM_OAUTH_PAGE_DESC")}
        bordered={false}
      >
        <SettingActionGroup>
          {OAUTH_PROVIDERS.map((provider) => {
            const state = providerState(provider);
            return (
              <SettingActionItem
                key={provider.key}
                title={t(provider.titleKey)}
                summary={formatProviderSummary(state.enabled, state.configured, t)}
                description={formatSummaryText(
                  state.clientId,
                  t("settings:SETTINGS_SYSTEM_NOT_CONFIGURED"),
                )}
                onTrigger={() => openOverlay(provider.key)}
              />
            );
          })}
        </SettingActionGroup>
      </SettingPanel>

      {overlays.renderOverlays()}
    </ContentGuard>
  );
}
